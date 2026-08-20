import { format } from "date-fns";

export interface EmailContent {
  subject: string;
  html: string;
}

function wrapper(title: string, body: string): string {
  return `<div style="font-family:sans-serif;max-width:560px;margin:0 auto">
  <h2 style="color:#1e3a8a">${title}</h2>
  ${body}
  <p style="color:#64748b;font-size:12px;margin-top:32px">This is an automated message from the clinic's appointment system.</p>
</div>`;
}

export function appointmentConfirmedEmail(params: {
  recipientName: string;
  counterpartName: string;
  startTime: Date;
}): EmailContent {
  const when = format(params.startTime, "EEEE, MMM d, yyyy 'at' h:mm a");
  return {
    subject: "Appointment confirmed",
    html: wrapper(
      "Appointment confirmed",
      `<p>Hi ${params.recipientName},</p>
       <p>Your appointment with ${params.counterpartName} is confirmed for <strong>${when}</strong>.</p>`
    ),
  };
}

export function appointmentCancelledEmail(params: {
  recipientName: string;
  counterpartName: string;
  startTime: Date;
  reason?: string;
}): EmailContent {
  const when = format(params.startTime, "EEEE, MMM d, yyyy 'at' h:mm a");
  return {
    subject: "Appointment cancelled",
    html: wrapper(
      "Appointment cancelled",
      `<p>Hi ${params.recipientName},</p>
       <p>Your appointment with ${params.counterpartName} on <strong>${when}</strong> has been cancelled${
        params.reason ? ` (${params.reason})` : ""
      }.</p>
       <p>Please book a new slot at your convenience.</p>`
    ),
  };
}

export function preVisitSummaryReadyEmail(params: { doctorName: string; patientName: string; urgencyLevel: string }): EmailContent {
  return {
    subject: `Pre-visit summary ready — ${params.patientName} (${params.urgencyLevel} urgency)`,
    html: wrapper(
      "Pre-visit summary ready",
      `<p>Hi Dr. ${params.doctorName},</p>
       <p>${params.patientName} submitted their symptoms. Urgency level: <strong>${params.urgencyLevel}</strong>.</p>`
    ),
  };
}

export function postVisitSummaryEmail(params: { patientName: string; summary: string }): EmailContent {
  return {
    subject: "Your visit summary",
    html: wrapper(
      "Your visit summary",
      `<p>Hi ${params.patientName},</p>
       <p>${params.summary.replace(/\n/g, "<br />")}</p>`
    ),
  };
}

export function medicationReminderEmail(params: { patientName: string; medicationName: string; dosage: string }): EmailContent {
  return {
    subject: `Medication reminder: ${params.medicationName}`,
    html: wrapper(
      "Medication reminder",
      `<p>Hi ${params.patientName},</p>
       <p>It's time to take your medication: <strong>${params.medicationName}</strong> (${params.dosage}).</p>`
    ),
  };
}
