import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const workingHoursSchema = z.record(
  z.string(),
  z.object({ start: z.string(), end: z.string() })
);

const updateDoctorSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  phone: z.string().max(30).optional(),
  specialisation: z.string().min(1).max(200).optional(),
  slotDurationMinutes: z.number().int().min(5).max(240).optional(),
  workingHours: workingHoursSchema.optional(),
});

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return null;
  }
  return session;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const doctor = await prisma.user.findFirst({
    where: { id, role: "DOCTOR" },
    select: { id: true, name: true, email: true, phone: true, doctorProfile: { include: { leaves: true } } },
  });

  if (!doctor) return NextResponse.json({ error: "Doctor not found" }, { status: 404 });
  return NextResponse.json({ doctor });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = updateDoctorSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }

  const doctor = await prisma.user.findFirst({ where: { id, role: "DOCTOR" }, include: { doctorProfile: true } });
  if (!doctor || !doctor.doctorProfile) {
    return NextResponse.json({ error: "Doctor not found" }, { status: 404 });
  }

  const { name, phone, specialisation, slotDurationMinutes, workingHours } = parsed.data;

  const updated = await prisma.user.update({
    where: { id },
    data: {
      name,
      phone,
      doctorProfile: {
        update: { specialisation, slotDurationMinutes, workingHours },
      },
    },
    select: { id: true, name: true, email: true, phone: true, doctorProfile: true },
  });

  return NextResponse.json({ doctor: updated });
}
