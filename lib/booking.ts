import { addMinutes, endOfDay, startOfDay } from "date-fns";
import { prisma } from "@/lib/prisma";
import { Prisma, type Appointment, type Role } from "@/generated/prisma/client";
import { isSlotAvailable } from "@/lib/slots";
import { sendNotification, queueNotification } from "@/lib/notify";
import { appointmentCancelledEmail, appointmentConfirmedEmail } from "@/lib/emailTemplates";

const HOLD_DURATION_MINUTES = 10;

export class BookingError extends Error {
  status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.status = status;
  }
}

// -- Slot holds ---------------------------------------------------------------

export async function createSlotHold(doctorId: string, patientId: string, startTime: Date) {
  const doctorProfile = await prisma.doctorProfile.findUnique({ where: { userId: doctorId } });
  if (!doctorProfile) throw new BookingError("Doctor not found", 404);

  const available = await isSlotAvailable(doctorId, startTime);
  if (!available) throw new BookingError("Slot no longer available");

  const endTime = addMinutes(startTime, doctorProfile.slotDurationMinutes);
  const expiresAt = addMinutes(new Date(), HOLD_DURATION_MINUTES);

  try {
    return await prisma.slotHold.create({
      data: { doctorId, patientId, startTime, endTime, expiresAt, status: "ACTIVE" },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new BookingError("Slot no longer available");
    }
    throw error;
  }
}

async function confirmSlotHold(holdId: string, patientId: string): Promise<Appointment> {
  return prisma.$transaction(async (tx) => {
    const hold = await tx.slotHold.findUnique({ where: { id: holdId } });
    if (!hold) throw new BookingError("Hold not found", 404);
    if (hold.patientId !== patientId) throw new BookingError("This hold does not belong to you", 403);
    if (hold.status !== "ACTIVE") throw new BookingError("This hold is no longer active");
    if (hold.expiresAt.getTime() < Date.now()) {
      await tx.slotHold.update({ where: { id: holdId }, data: { status: "EXPIRED" } });
      throw new BookingError("This hold has expired");
    }

    let appointment: Appointment;
    try {
      appointment = await tx.appointment.create({
        data: {
          doctorId: hold.doctorId,
          patientId: hold.patientId,
          startTime: hold.startTime,
          endTime: hold.endTime,
          status: "CONFIRMED",
        },
      });
    } catch (error) {
      // Database-enforced double-booking guard: @@unique([doctorId, startTime]) on Appointment.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new BookingError("Slot no longer available");
      }
      throw error;
    }

    await tx.slotHold.update({ where: { id: holdId }, data: { status: "CONSUMED" } });

    return appointment;
  });
}

async function notifyAppointmentConfirmed(appointment: Appointment) {
  const [doctor, patient] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: appointment.doctorId } }),
    prisma.user.findUniqueOrThrow({ where: { id: appointment.patientId } }),
  ]);

  const patientEmail = appointmentConfirmedEmail({
    recipientName: patient.name,
    counterpartName: `Dr. ${doctor.name}`,
    startTime: appointment.startTime,
  });
  const doctorEmail = appointmentConfirmedEmail({
    recipientName: doctor.name,
    counterpartName: patient.name,
    startTime: appointment.startTime,
  });

  await Promise.all([
    sendNotification({
      channel: "EMAIL",
      type: "APPOINTMENT_CONFIRMED",
      recipientId: patient.id,
      payload: { to: patient.email, subject: patientEmail.subject, html: patientEmail.html },
    }),
    sendNotification({
      channel: "EMAIL",
      type: "APPOINTMENT_CONFIRMED",
      recipientId: doctor.id,
      payload: { to: doctor.email, subject: doctorEmail.subject, html: doctorEmail.html },
    }),
    queueNotification({
      channel: "CALENDAR",
      type: "CALENDAR_CREATE",
      recipientId: patient.id,
      payload: {
        action: "create",
        calendarUserId: patient.id,
        appointmentId: appointment.id,
        eventField: "googleEventIdPatient",
        event: {
          summary: `Appointment with Dr. ${doctor.name}`,
          description: "Healthcare appointment",
          startTime: appointment.startTime.toISOString(),
          endTime: appointment.endTime.toISOString(),
        },
      },
    }),
    queueNotification({
      channel: "CALENDAR",
      type: "CALENDAR_CREATE",
      recipientId: doctor.id,
      payload: {
        action: "create",
        calendarUserId: doctor.id,
        appointmentId: appointment.id,
        eventField: "googleEventIdDoctor",
        event: {
          summary: `Appointment with ${patient.name}`,
          description: "Healthcare appointment",
          startTime: appointment.startTime.toISOString(),
          endTime: appointment.endTime.toISOString(),
        },
      },
    }),
  ]);
}

/** Converts a valid hold into a CONFIRMED appointment, then sends confirmation emails and queues calendar-create events. */
export async function bookAppointment(holdId: string, patientId: string): Promise<Appointment> {
  const appointment = await confirmSlotHold(holdId, patientId);
  await notifyAppointmentConfirmed(appointment);
  return appointment;
}

// -- Cancellation ---------------------------------------------------------------

async function queueCancellationNotifications(appointment: Appointment, reason?: string) {
  const [doctor, patient] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: appointment.doctorId } }),
    prisma.user.findUniqueOrThrow({ where: { id: appointment.patientId } }),
  ]);

  const patientEmail = appointmentCancelledEmail({
    recipientName: patient.name,
    counterpartName: `Dr. ${doctor.name}`,
    startTime: appointment.startTime,
    reason,
  });

  const tasks = [
    queueNotification({
      channel: "EMAIL",
      type: "APPOINTMENT_CANCELLED",
      recipientId: patient.id,
      payload: { to: patient.email, subject: patientEmail.subject, html: patientEmail.html },
    }),
  ];

  if (appointment.googleEventIdPatient) {
    tasks.push(
      queueNotification({
        channel: "CALENDAR",
        type: "CALENDAR_DELETE",
        recipientId: patient.id,
        payload: {
          action: "delete",
          calendarUserId: patient.id,
          appointmentId: appointment.id,
          eventField: "googleEventIdPatient",
          eventId: appointment.googleEventIdPatient,
        },
      })
    );
  }

  if (appointment.googleEventIdDoctor) {
    tasks.push(
      queueNotification({
        channel: "CALENDAR",
        type: "CALENDAR_DELETE",
        recipientId: doctor.id,
        payload: {
          action: "delete",
          calendarUserId: doctor.id,
          appointmentId: appointment.id,
          eventField: "googleEventIdDoctor",
          eventId: appointment.googleEventIdDoctor,
        },
      })
    );
  }

  await Promise.all(tasks);
}

export async function cancelAppointment(
  appointmentId: string,
  actorId: string,
  actorRole: Role,
  reason?: string
): Promise<Appointment> {
  const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appointment) throw new BookingError("Appointment not found", 404);
  if (actorRole === "PATIENT" && appointment.patientId !== actorId) throw new BookingError("Forbidden", 403);
  if (actorRole === "DOCTOR" && appointment.doctorId !== actorId) throw new BookingError("Forbidden", 403);
  if (appointment.status !== "CONFIRMED") throw new BookingError("Only confirmed appointments can be cancelled");

  const updated = await prisma.appointment.update({
    where: { id: appointmentId },
    data: { status: "CANCELLED" },
  });

  // Notifications are queued (not sent inline) so cancellation responds quickly
  // and a flaky SMTP/Google call can't fail the cancellation itself.
  await queueCancellationNotifications(updated, reason);

  return updated;
}

// -- Doctor leave ---------------------------------------------------------------

export async function markDoctorLeave(doctorUserId: string, date: Date, reason?: string) {
  const profile = await prisma.doctorProfile.findUnique({ where: { userId: doctorUserId } });
  if (!profile) throw new BookingError("Doctor profile not found", 404);

  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);

  const { leave, affected } = await prisma.$transaction(async (tx) => {
    const leave = await tx.doctorLeave.upsert({
      where: { doctorId_date: { doctorId: profile.id, date: dayStart } },
      update: { reason },
      create: { doctorId: profile.id, date: dayStart, reason },
    });

    const affected = await tx.appointment.findMany({
      where: { doctorId: doctorUserId, status: "CONFIRMED", startTime: { gte: dayStart, lte: dayEnd } },
    });

    for (const appt of affected) {
      await tx.appointment.update({ where: { id: appt.id }, data: { status: "CANCELLED" } });
    }

    return { leave, affected };
  });

  // Notification + calendar-delete per patient are queued outside the transaction
  // so a slow email/calendar provider never holds the leave-marking transaction open.
  for (const appt of affected) {
    await queueCancellationNotifications({ ...appt, status: "CANCELLED" }, reason ?? "the doctor is unavailable that day");
  }

  return { leave, cancelledAppointmentIds: affected.map((a) => a.id) };
}

// -- Reschedule ---------------------------------------------------------------

export async function rescheduleAppointment(
  oldAppointmentId: string,
  newHoldId: string,
  patientId: string
): Promise<Appointment> {
  const oldAppointment = await prisma.appointment.findUnique({ where: { id: oldAppointmentId } });
  if (!oldAppointment) throw new BookingError("Appointment not found", 404);
  if (oldAppointment.patientId !== patientId) throw new BookingError("Forbidden", 403);
  if (oldAppointment.status !== "CONFIRMED") throw new BookingError("Only confirmed appointments can be rescheduled");

  const newAppointment = await prisma.$transaction(async (tx) => {
    const hold = await tx.slotHold.findUnique({ where: { id: newHoldId } });
    if (!hold) throw new BookingError("Hold not found", 404);
    if (hold.patientId !== patientId) throw new BookingError("This hold does not belong to you", 403);
    if (hold.status !== "ACTIVE") throw new BookingError("This hold is no longer active");
    if (hold.expiresAt.getTime() < Date.now()) {
      await tx.slotHold.update({ where: { id: newHoldId }, data: { status: "EXPIRED" } });
      throw new BookingError("This hold has expired");
    }
    if (hold.doctorId !== oldAppointment.doctorId) {
      throw new BookingError("Reschedules must stay with the same doctor");
    }

    let created: Appointment;
    try {
      created = await tx.appointment.create({
        data: {
          doctorId: hold.doctorId,
          patientId: hold.patientId,
          startTime: hold.startTime,
          endTime: hold.endTime,
          status: "CONFIRMED",
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new BookingError("Slot no longer available");
      }
      throw error;
    }

    await tx.slotHold.update({ where: { id: newHoldId }, data: { status: "CONSUMED" } });
    await tx.appointment.update({ where: { id: oldAppointmentId }, data: { status: "RESCHEDULED" } });

    return created;
  });

  await queueCancellationNotifications(oldAppointment, "it was rescheduled to a new time");
  await notifyAppointmentConfirmed(newAppointment);

  return newAppointment;
}
