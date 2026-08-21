import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function PatientAppointmentPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const { id } = await params;

  const appointment = await prisma.appointment.findUnique({
    where: { id },
    include: {
      doctor: { select: { name: true } },
      preVisitSummary: true,
      postVisitSummary: true,
      prescriptions: true,
    },
  });

  if (!appointment || appointment.patientId !== session?.user.id) notFound();

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/patient" className="text-sm text-blue-600 underline">
        &larr; Back
      </Link>
      <h1 className="mb-1 mt-2 text-2xl font-bold">Dr. {appointment.doctor.name}</h1>
      <p className="mb-6 text-sm text-slate-600">
        {appointment.startTime.toLocaleString()} — status: {appointment.status}
      </p>

      {appointment.preVisitSummary && (
        <section className="mb-6 rounded border border-slate-300 p-4">
          <h2 className="mb-2 font-semibold">Your pre-visit summary</h2>
          <p className="text-sm">Urgency: {appointment.preVisitSummary.urgencyLevel}</p>
          <p className="text-sm">Chief complaint: {appointment.preVisitSummary.chiefComplaint}</p>
        </section>
      )}

      {appointment.postVisitSummary && (
        <section className="mb-6 rounded border border-slate-300 p-4">
          <h2 className="mb-2 font-semibold">Visit summary</h2>
          <p className="whitespace-pre-line text-sm">{appointment.postVisitSummary.summary}</p>
        </section>
      )}

      {appointment.prescriptions.length > 0 && (
        <section className="rounded border border-slate-300 p-4">
          <h2 className="mb-2 font-semibold">Prescriptions</h2>
          <ul className="list-disc pl-5 text-sm">
            {appointment.prescriptions.map((p) => (
              <li key={p.id}>
                {p.medicationName} — {p.dosage}, {p.frequencyPerDay}x/day for {p.durationDays} days
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
