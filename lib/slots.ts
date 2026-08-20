import { addDays, addMinutes, isBefore, isSameDay, startOfDay } from "date-fns";
import { prisma } from "@/lib/prisma";

const WEEKDAY_KEYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;

type WorkingHours = Partial<Record<(typeof WEEKDAY_KEYS)[number], { start: string; end: string }>>;

export interface Slot {
  startTime: Date;
  endTime: Date;
}

function parseTimeOnDate(day: Date, hhmm: string): Date {
  const [hours, minutes] = hhmm.split(":").map(Number);
  const result = new Date(day);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

/**
 * Returns bookable slots for a doctor between `from` and `to` (inclusive days),
 * excluding leave days, past times, already-confirmed appointments, and
 * currently-active (non-expired) holds.
 */
export async function getAvailableSlots(doctorId: string, from: Date, to: Date): Promise<Slot[]> {
  const profile = await prisma.doctorProfile.findUnique({
    where: { userId: doctorId },
  });
  if (!profile) {
    return [];
  }

  const workingHours = profile.workingHours as WorkingHours;
  const rangeStart = startOfDay(from);
  const rangeEnd = startOfDay(to);

  const [leaves, appointments, holds] = await Promise.all([
    prisma.doctorLeave.findMany({
      where: { doctorId: profile.id, date: { gte: rangeStart, lte: rangeEnd } },
    }),
    prisma.appointment.findMany({
      where: {
        doctorId,
        startTime: { gte: rangeStart, lte: addDays(rangeEnd, 1) },
        status: { in: ["CONFIRMED", "COMPLETED"] },
      },
      select: { startTime: true },
    }),
    prisma.slotHold.findMany({
      where: {
        doctorId,
        startTime: { gte: rangeStart, lte: addDays(rangeEnd, 1) },
        status: "ACTIVE",
        expiresAt: { gt: new Date() },
      },
      select: { startTime: true },
    }),
  ]);

  const blockedTimes = new Set<number>([
    ...appointments.map((a) => a.startTime.getTime()),
    ...holds.map((h) => h.startTime.getTime()),
  ]);
  const leaveDays = leaves.map((l) => l.date);

  const now = new Date();
  const slots: Slot[] = [];

  for (let day = rangeStart; !isBefore(rangeEnd, day); day = addDays(day, 1)) {
    if (leaveDays.some((leaveDate) => isSameDay(leaveDate, day))) {
      continue;
    }

    const weekday = WEEKDAY_KEYS[day.getDay()];
    const hours = workingHours[weekday];
    if (!hours) {
      continue;
    }

    const dayStart = parseTimeOnDate(day, hours.start);
    const dayEnd = parseTimeOnDate(day, hours.end);

    for (
      let slotStart = dayStart;
      isBefore(addMinutes(slotStart, profile.slotDurationMinutes), addMinutes(dayEnd, 1));
      slotStart = addMinutes(slotStart, profile.slotDurationMinutes)
    ) {
      if (isBefore(slotStart, now)) {
        continue;
      }
      if (blockedTimes.has(slotStart.getTime())) {
        continue;
      }
      slots.push({ startTime: slotStart, endTime: addMinutes(slotStart, profile.slotDurationMinutes) });
    }
  }

  return slots;
}

export async function isSlotAvailable(doctorId: string, startTime: Date): Promise<boolean> {
  const profile = await prisma.doctorProfile.findUnique({ where: { userId: doctorId } });
  if (!profile) return false;

  const weekday = WEEKDAY_KEYS[startTime.getDay()];
  const workingHours = profile.workingHours as WorkingHours;
  const hours = workingHours[weekday];
  if (!hours) return false;

  const dayStart = parseTimeOnDate(startTime, hours.start);
  const dayEnd = parseTimeOnDate(startTime, hours.end);
  if (isBefore(startTime, dayStart) || isBefore(dayEnd, addMinutes(startTime, profile.slotDurationMinutes))) {
    return false;
  }
  if (isBefore(startTime, new Date())) return false;

  const [leave, existingAppointment, activeHold] = await Promise.all([
    prisma.doctorLeave.findUnique({
      where: { doctorId_date: { doctorId: profile.id, date: startOfDay(startTime) } },
    }),
    prisma.appointment.findFirst({
      where: { doctorId, startTime, status: { in: ["CONFIRMED", "COMPLETED"] } },
    }),
    prisma.slotHold.findFirst({
      where: { doctorId, startTime, status: "ACTIVE", expiresAt: { gt: new Date() } },
    }),
  ]);

  return !leave && !existingAppointment && !activeHold;
}
