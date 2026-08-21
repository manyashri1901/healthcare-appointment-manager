import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SignOutButton } from "@/app/components/SignOutButton";

export const dynamic = "force-dynamic";

export default async function DoctorPage() {
  const session = await getServerSession(authOptions);

  const appointments = await prisma.appointment.findMany({
    where: { doctorId: session!.user.id, status: "CONFIRMED" },
    include: { patient: { select: { name: true } }, preVisitSummary: true },
    orderBy: { startTime: "asc" },
  });

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Doctor dashboard</h1>
          <p className="text-sm text-slate-600">Signed in as {session?.user?.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/api/google/connect" className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100">
            Connect Google Calendar
          </a>
          <SignOutButton />
        </div>
      </div>

      <h2 className="mb-2 text-lg font-semibold">Upcoming appointments</h2>
      <ul className="divide-y divide-slate-200 rounded border border-slate-200">
        {appointments.map((appt) => (
          <li key={appt.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="font-medium">{appt.patient.name}</p>
              <p className="text-sm text-slate-600">{appt.startTime.toLocaleString()}</p>
              {appt.preVisitSummary && (
                <p className="text-sm">
                  Urgency:{" "}
                  <span
                    className={
                      appt.preVisitSummary.urgencyLevel === "HIGH"
                        ? "font-semibold text-red-600"
                        : appt.preVisitSummary.urgencyLevel === "MEDIUM"
                          ? "font-semibold text-amber-600"
                          : "text-slate-600"
                    }
                  >
                    {appt.preVisitSummary.urgencyLevel}
                  </span>
                </p>
              )}
            </div>
            <Link href={`/doctor/appointments/${appt.id}`} className="text-sm text-blue-600 underline">
              View
            </Link>
          </li>
        ))}
        {appointments.length === 0 && <li className="px-4 py-3 text-sm text-slate-600">No upcoming appointments.</li>}
      </ul>
    </main>
  );
}
