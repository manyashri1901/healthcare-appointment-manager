import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from "@/lib/google";
import { Prisma, type NotificationChannel } from "@/generated/prisma/client";

const BACKOFF_MINUTES = [1, 5, 30, 120, 720]; // 1m, 5m, 30m, 2h, 12h
const DEFAULT_MAX_ATTEMPTS = 5;

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

export interface CalendarPayload {
  action: "create" | "update" | "delete";
  calendarUserId: string;
  appointmentId: string;
  eventField: "googleEventIdPatient" | "googleEventIdDoctor";
  eventId?: string;
  event?: {
    summary: string;
    description?: string;
    startTime: string;
    endTime: string;
    attendeeEmails?: string[];
  };
}

export type NotificationPayload = EmailPayload | CalendarPayload;

interface QueueParams {
  channel: NotificationChannel;
  type: string;
  recipientId: string;
  payload: NotificationPayload;
}

/** Inserts a PENDING NotificationLog row without attempting to send. Picked up later by the retry cron. */
export async function queueNotification(params: QueueParams): Promise<string> {
  const log = await prisma.notificationLog.create({
    data: {
      channel: params.channel,
      type: params.type,
      recipientId: params.recipientId,
      payload: params.payload as unknown as Prisma.InputJsonValue,
      status: "PENDING",
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
    },
  });
  return log.id;
}

/** Queues a notification and attempts to send it immediately (used for user-facing flows like booking confirmation). */
export async function sendNotification(params: QueueParams): Promise<void> {
  const id = await queueNotification(params);
  await attemptSend(id);
}

async function performSend(channel: NotificationChannel, payload: NotificationPayload): Promise<void> {
  if (channel === "EMAIL") {
    const p = payload as EmailPayload;
    await sendEmail({ to: p.to, subject: p.subject, html: p.html });
    return;
  }

  const p = payload as CalendarPayload;
  if (p.action === "create") {
    if (!p.event) throw new Error("Missing event data for calendar create");
    const eventId = await createCalendarEvent(p.calendarUserId, {
      summary: p.event.summary,
      description: p.event.description,
      startTime: new Date(p.event.startTime),
      endTime: new Date(p.event.endTime),
      attendeeEmails: p.event.attendeeEmails,
    });
    if (eventId) {
      await prisma.appointment.update({
        where: { id: p.appointmentId },
        data: { [p.eventField]: eventId },
      });
    }
    return;
  }

  if (p.action === "update") {
    if (!p.eventId || !p.event) return;
    await updateCalendarEvent(p.calendarUserId, p.eventId, {
      summary: p.event.summary,
      description: p.event.description,
      startTime: new Date(p.event.startTime),
      endTime: new Date(p.event.endTime),
    });
    return;
  }

  if (p.action === "delete") {
    if (!p.eventId) return;
    await deleteCalendarEvent(p.calendarUserId, p.eventId);
  }
}

/** Attempts to send a single notification log row and records the outcome. Never throws. */
export async function attemptSend(logId: string): Promise<void> {
  const log = await prisma.notificationLog.findUnique({ where: { id: logId } });
  if (!log) return;

  try {
    await performSend(log.channel, log.payload as unknown as NotificationPayload);
    await prisma.notificationLog.update({
      where: { id: log.id },
      data: { status: "SENT", attempts: { increment: 1 }, nextRetryAt: null },
    });
  } catch (error) {
    const attempts = log.attempts + 1;
    const maxAttempts = log.maxAttempts || DEFAULT_MAX_ATTEMPTS;

    if (attempts >= maxAttempts) {
      await prisma.notificationLog.update({
        where: { id: log.id },
        data: { status: "ABANDONED", attempts, nextRetryAt: null },
      });
    } else {
      const backoffMinutes = BACKOFF_MINUTES[attempts - 1] ?? BACKOFF_MINUTES[BACKOFF_MINUTES.length - 1];
      await prisma.notificationLog.update({
        where: { id: log.id },
        data: {
          status: "FAILED",
          attempts,
          nextRetryAt: new Date(Date.now() + backoffMinutes * 60_000),
        },
      });
    }

    console.error(`Notification ${log.id} (${log.channel}/${log.type}) failed:`, error);
  }
}

/**
 * Processes the notification queue: brand-new PENDING rows plus FAILED rows
 * whose backoff window has elapsed. Intended to be called from a cron route.
 */
export async function processNotificationQueue(limit = 50): Promise<{ processed: number }> {
  const now = new Date();

  const due = await prisma.notificationLog.findMany({
    where: {
      OR: [
        { status: "PENDING" },
        { status: "FAILED", nextRetryAt: { lte: now } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  for (const log of due) {
    await attemptSend(log.id);
  }

  return { processed: due.length };
}
