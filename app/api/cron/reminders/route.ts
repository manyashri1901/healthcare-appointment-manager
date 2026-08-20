import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendNotification } from "@/lib/notify";
import { medicationReminderEmail } from "@/lib/emailTemplates";

function isAuthorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const header = request.headers.get("authorization");
  return header === `Bearer ${expected}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const due = await prisma.medicationReminder.findMany({
    where: { status: "PENDING", scheduledAt: { lte: new Date() } },
    include: { prescription: { include: { patient: true } } },
    take: 100,
  });

  let sent = 0;
  let failed = 0;

  for (const reminder of due) {
    const { patient } = reminder.prescription;
    const email = medicationReminderEmail({
      patientName: patient.name,
      medicationName: reminder.prescription.medicationName,
      dosage: reminder.prescription.dosage,
    });

    const { success } = await sendNotification({
      channel: "EMAIL",
      type: "MEDICATION_REMINDER",
      recipientId: patient.id,
      payload: { to: patient.email, subject: email.subject, html: email.html },
    });

    if (success) {
      sent++;
      await prisma.medicationReminder.update({
        where: { id: reminder.id },
        data: { status: "SENT", attempts: { increment: 1 } },
      });
    } else {
      failed++;
      await prisma.medicationReminder.update({
        where: { id: reminder.id },
        data: { status: "FAILED", attempts: { increment: 1 } },
      });
    }
  }

  return NextResponse.json({ processed: due.length, sent, failed });
}
