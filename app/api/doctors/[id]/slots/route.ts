import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { addDays } from "date-fns";
import { authOptions } from "@/lib/auth";
import { getAvailableSlots } from "@/lib/slots";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const url = new URL(request.url);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");

  const from = fromParam ? new Date(fromParam) : new Date();
  const to = toParam ? new Date(toParam) : addDays(from, 6);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }

  const slots = await getAvailableSlots(id, from, to);
  return NextResponse.json({ slots });
}
