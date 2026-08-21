import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SignOutButton } from "@/app/components/SignOutButton";
import { CancelAppointmentButton } from "@/app/components/CancelAppointmentButton";

export const dynamic = "force-dynamic";

export default async function PatientPage() {
  const session = await getServerSession(authOptions);

  const appointments = await prisma.appointment.findMany({
    where: { patientId: session!.user.id, status: { in: ["CONFIRMED", "COMPLETED"] } },
    include: { doctor: { select: { name: true } } },
    orderBy: { startTime: "asc" },
  });

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Patient dashboard</h1>
          <p className="text-sm text-slate-600">Signed in as {session?.user?.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/api/google/connect" className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100">
            Connect Google Calendar
          </a>
          <SignOutButton />
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Your appointments</h2>
        <Link href="/patient/book" className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700">
          Book appointment
        </Link>
      </div>

      <ul className="divide-y divide-slate-200 rounded border border-slate-200">
        {appointments.map((appt) => (
          <li key={appt.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="font-medium">Dr. {appt.doctor.name}</p>
              <p className="text-sm text-slate-600">
                {appt.startTime.toLocaleString()} — {appt.status}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Link href={`/patient/appointments/${appt.id}`} className="text-sm text-blue-600 underline">
                View
              </Link>
              {appt.status === "CONFIRMED" && (
                <>
                  <Link href={`/patient/appointments/${appt.id}/reschedule`} className="text-sm text-blue-600 underline">
                    Reschedule
                  </Link>
                  <CancelAppointmentButton appointmentId={appt.id} />
                </>
              )}
            </div>
          </li>
        ))}
        {appointments.length === 0 && <li className="px-4 py-3 text-sm text-slate-600">No appointments yet.</li>}
      </ul>
    </main>
  );
}
