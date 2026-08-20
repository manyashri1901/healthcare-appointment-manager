import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { bookAppointment, BookingError } from "@/lib/booking";
import { prisma } from "@/lib/prisma";
import { analyzeSymptoms } from "@/lib/llm";
import { sendNotification } from "@/lib/notify";
import { preVisitSummaryReadyEmail } from "@/lib/emailTemplates";

const confirmSchema = z.object({
  holdId: z.string().min(1),
  symptoms: z.string().min(1).max(4000).optional(),
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "PATIENT") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = confirmSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }

  let appointment;
  try {
    appointment = await bookAppointment(parsed.data.holdId, session.user.id);
  } catch (error) {
    if (error instanceof BookingError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

  if (parsed.data.symptoms) {
    const symptomForm = await prisma.symptomForm.create({
      data: {
        appointmentId: appointment.id,
        patientId: session.user.id,
        symptoms: parsed.data.symptoms,
      },
    });

    const analysis = await analyzeSymptoms(parsed.data.symptoms);

    await prisma.preVisitSummary.create({
      data: {
        appointmentId: appointment.id,
        symptomFormId: symptomForm.id,
        urgencyLevel: analysis.urgencyLevel,
        chiefComplaint: analysis.chiefComplaint,
        suggestedQuestions: analysis.suggestedQuestions,
        status: analysis.status,
      },
    });

    const [doctor, patient] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: appointment.doctorId } }),
      prisma.user.findUniqueOrThrow({ where: { id: appointment.patientId } }),
    ]);

    const email = preVisitSummaryReadyEmail({
      doctorName: doctor.name,
      patientName: patient.name,
      urgencyLevel: analysis.urgencyLevel,
    });

    await sendNotification({
      channel: "EMAIL",
      type: "PRE_VISIT_SUMMARY_READY",
      recipientId: doctor.id,
      payload: { to: doctor.email, subject: email.subject, html: email.html },
    });
  }

  return NextResponse.json({ appointment }, { status: 201 });
}
