import nodemailer from "nodemailer";

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER
      ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD,
        }
      : undefined,
  });

  return transporter;
}

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Sends an email over SMTP. Throws on failure so callers (lib/notify.ts)
 * can record it against the NotificationLog row and schedule a retry.
 */
export async function sendEmail({ to, subject, html, text }: SendEmailParams): Promise<void> {
  if (!process.env.SMTP_HOST) {
    throw new Error("SMTP_HOST is not configured");
  }

  await getTransporter().sendMail({
    from: process.env.EMAIL_FROM ?? "Clinic <no-reply@clinic.example.com>",
    to,
    subject,
    html,
    text: text ?? html.replace(/<[^>]+>/g, " "),
  });
}
