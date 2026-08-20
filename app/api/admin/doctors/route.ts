import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const workingHoursSchema = z.record(
  z.string(),
  z.object({ start: z.string(), end: z.string() })
);

const createDoctorSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  password: z.string().min(8).max(200),
  phone: z.string().max(30).optional(),
  specialisation: z.string().min(1).max(200),
  slotDurationMinutes: z.number().int().min(5).max(240).default(30),
  workingHours: workingHoursSchema,
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const doctors = await prisma.user.findMany({
    where: { role: "DOCTOR" },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      createdAt: true,
      doctorProfile: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ doctors });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createDoctorSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }

  const { name, email, password, phone, specialisation, slotDurationMinutes, workingHours } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const doctor = await prisma.user.create({
    data: {
      name,
      email: normalizedEmail,
      passwordHash,
      phone,
      role: "DOCTOR",
      doctorProfile: {
        create: { specialisation, slotDurationMinutes, workingHours },
      },
    },
    select: { id: true, name: true, email: true, doctorProfile: true },
  });

  return NextResponse.json({ doctor }, { status: 201 });
}
