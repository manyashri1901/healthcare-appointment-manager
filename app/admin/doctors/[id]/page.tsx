import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { LeaveForm } from "./LeaveForm";

export const dynamic = "force-dynamic";

export default async function AdminDoctorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const doctor = await prisma.user.findFirst({
    where: { id, role: "DOCTOR" },
    include: { doctorProfile: { include: { leaves: { orderBy: { date: "desc" }, take: 10 } } } },
  });

  if (!doctor || !doctor.doctorProfile) notFound();

  const workingHours = doctor.doctorProfile.workingHours as Record<string, { start: string; end: string }>;

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/admin" className="text-sm text-blue-600 underline">
        &larr; Back
      </Link>
      <h1 className="mb-1 mt-2 text-2xl font-bold">{doctor.name}</h1>
      <p className="mb-6 text-sm text-slate-600">
        {doctor.email} — {doctor.doctorProfile.specialisation} — {doctor.doctorProfile.slotDurationMinutes} min slots
      </p>

      <section className="mb-6">
        <h2 className="mb-2 font-semibold">Working hours</h2>
        <ul className="text-sm text-slate-700">
          {Object.entries(workingHours).map(([day, hours]) => (
            <li key={day}>
              {day}: {hours.start} – {hours.end}
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-6">
        <LeaveForm doctorId={doctor.id} />
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Recent leave days</h2>
        <ul className="text-sm text-slate-700">
          {doctor.doctorProfile.leaves.map((leave) => (
            <li key={leave.id}>
              {leave.date.toDateString()} {leave.reason ? `— ${leave.reason}` : ""}
            </li>
          ))}
          {doctor.doctorProfile.leaves.length === 0 && <li>None recorded.</li>}
        </ul>
      </section>
    </main>
  );
}
