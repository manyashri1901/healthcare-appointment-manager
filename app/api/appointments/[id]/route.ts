import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rescheduleAppointment, BookingError } from "@/lib/booking";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const appointment = await prisma.appointment.findUnique({
    where: { id },
    include: {
      doctor: { select: { id: true, name: true } },
      patient: { select: { id: true, name: true } },
      symptomForm: true,
      preVisitSummary: true,
      postVisitNote: true,
      postVisitSummary: true,
      prescriptions: true,
    },
  });

  if (!appointment) return NextResponse.json({ error: "Appointment not found" }, { status: 404 });

  const isParticipant = appointment.doctorId === session.user.id || appointment.patientId === session.user.id;
  if (!isParticipant && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ appointment });
}

const rescheduleSchema = z.object({
  newHoldId: z.string().min(1),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "PATIENT") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = rescheduleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const appointment = await rescheduleAppointment(id, parsed.data.newHoldId, session.user.id);
    return NextResponse.json({ appointment });
  } catch (error) {
    if (error instanceof BookingError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
