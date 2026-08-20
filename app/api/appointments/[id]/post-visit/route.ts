import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { addDays, startOfDay } from "date-fns";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { summarizePostVisit } from "@/lib/llm";
import { sendNotification } from "@/lib/notify";
import { postVisitSummaryEmail } from "@/lib/emailTemplates";

const prescriptionSchema = z.object({
  medicationName: z.string().min(1).max(200),
  dosage: z.string().min(1).max(100),
  frequencyPerDay: z.number().int().min(1).max(8),
  durationDays: z.number().int().min(1).max(90),
});

const postVisitSchema = z.object({
  notes: z.string().min(1).max(8000),
  prescriptions: z.array(prescriptionSchema).default([]),
});

const REMINDER_WINDOW_START_HOUR = 8;
const REMINDER_WINDOW_END_HOUR = 20;

function buildReminderTimes(frequencyPerDay: number, durationDays: number): Date[] {
  const hours =
    frequencyPerDay === 1
      ? [9]
      : Array.from({ length: frequencyPerDay }, (_, i) =>
          REMINDER_WINDOW_START_HOUR +
          (i * (REMINDER_WINDOW_END_HOUR - REMINDER_WINDOW_START_HOUR)) / (frequencyPerDay - 1)
        );

  const firstDay = addDays(startOfDay(new Date()), 1);
  const times: Date[] = [];

  for (let day = 0; day < durationDays; day++) {
    for (const hour of hours) {
      const scheduledAt = addDays(firstDay, day);
      scheduledAt.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0);
      times.push(scheduledAt);
    }
  }

  return times;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "DOCTOR") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = postVisitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }

  const appointment = await prisma.appointment.findUnique({ where: { id } });
  if (!appointment) return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  if (appointment.doctorId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (appointment.status !== "CONFIRMED") {
    return NextResponse.json({ error: "Only confirmed appointments can be completed" }, { status: 409 });
  }

  const { notes, prescriptions } = parsed.data;

  const postVisitNote = await prisma.postVisitNote.create({
    data: { appointmentId: appointment.id, notes },
  });

  const summaryResult = await summarizePostVisit(notes);

  const postVisitSummary = await prisma.postVisitSummary.create({
    data: {
      appointmentId: appointment.id,
      postVisitNoteId: postVisitNote.id,
      summary: summaryResult.summary,
      status: summaryResult.status,
    },
  });

  const createdPrescriptions = [];
  for (const p of prescriptions) {
    const prescription = await prisma.prescription.create({
      data: {
        appointmentId: appointment.id,
        patientId: appointment.patientId,
        medicationName: p.medicationName,
        dosage: p.dosage,
        frequencyPerDay: p.frequencyPerDay,
        durationDays: p.durationDays,
      },
    });

    const reminderTimes = buildReminderTimes(p.frequencyPerDay, p.durationDays);
    await prisma.medicationReminder.createMany({
      data: reminderTimes.map((scheduledAt) => ({
        prescriptionId: prescription.id,
        scheduledAt,
      })),
    });

    createdPrescriptions.push(prescription);
  }

  await prisma.appointment.update({ where: { id: appointment.id }, data: { status: "COMPLETED" } });

  const patient = await prisma.user.findUniqueOrThrow({ where: { id: appointment.patientId } });
  const email = postVisitSummaryEmail({ patientName: patient.name, summary: summaryResult.summary });

  await sendNotification({
    channel: "EMAIL",
    type: "POST_VISIT_SUMMARY",
    recipientId: patient.id,
    payload: { to: patient.email, subject: email.subject, html: email.html },
  });

  return NextResponse.json(
    { postVisitNote, postVisitSummary, prescriptions: createdPrescriptions },
    { status: 201 }
  );
}
