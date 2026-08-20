import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const WEEKDAY_HOURS = {
  MON: { start: "09:00", end: "17:00" },
  TUE: { start: "09:00", end: "17:00" },
  WED: { start: "09:00", end: "17:00" },
  THU: { start: "09:00", end: "17:00" },
  FRI: { start: "09:00", end: "13:00" },
};

async function upsertUser(params: {
  email: string;
  name: string;
  password: string;
  role: "ADMIN" | "DOCTOR" | "PATIENT";
  phone?: string;
}) {
  const passwordHash = await bcrypt.hash(params.password, 10);
  return prisma.user.upsert({
    where: { email: params.email },
    update: {},
    create: {
      email: params.email,
      name: params.name,
      passwordHash,
      role: params.role,
      phone: params.phone,
    },
  });
}

async function main() {
  const admin = await upsertUser({
    email: "admin@clinic.example.com",
    name: "Clinic Admin",
    password: "Password123!",
    role: "ADMIN",
  });

  const doctor1User = await upsertUser({
    email: "dr.patel@clinic.example.com",
    name: "Dr. Anjali Patel",
    password: "Password123!",
    role: "DOCTOR",
    phone: "+1-555-0101",
  });

  const doctor2User = await upsertUser({
    email: "dr.chen@clinic.example.com",
    name: "Dr. Wei Chen",
    password: "Password123!",
    role: "DOCTOR",
    phone: "+1-555-0102",
  });

  const patient = await upsertUser({
    email: "patient@example.com",
    name: "Jordan Smith",
    password: "Password123!",
    role: "PATIENT",
    phone: "+1-555-0199",
  });

  await prisma.doctorProfile.upsert({
    where: { userId: doctor1User.id },
    update: {},
    create: {
      userId: doctor1User.id,
      specialisation: "General Medicine",
      slotDurationMinutes: 30,
      workingHours: WEEKDAY_HOURS,
    },
  });

  await prisma.doctorProfile.upsert({
    where: { userId: doctor2User.id },
    update: {},
    create: {
      userId: doctor2User.id,
      specialisation: "Cardiology",
      slotDurationMinutes: 20,
      workingHours: WEEKDAY_HOURS,
    },
  });

  console.log("Seeded:", {
    admin: admin.email,
    doctors: [doctor1User.email, doctor2User.email],
    patient: patient.email,
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
