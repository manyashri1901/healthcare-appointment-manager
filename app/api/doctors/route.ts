import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const doctors = await prisma.user.findMany({
    where: { role: "DOCTOR", doctorProfile: { isNot: null } },
    select: {
      id: true,
      name: true,
      doctorProfile: {
        select: { specialisation: true, slotDurationMinutes: true },
      },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ doctors });
}
