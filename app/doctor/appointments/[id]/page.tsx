import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CancelAppointmentButton } from "@/app/components/CancelAppointmentButton";
import { PostVisitForm } from "./PostVisitForm";

export const dynamic = "force-dynamic";

export default async function DoctorAppointmentPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const { id } = await params;

  const appointment = await prisma.appointment.findUnique({
    where: { id },
    include: {
      patient: { select: { name: true, email: true, phone: true } },
      symptomForm: true,
      preVisitSummary: true,
      postVisitSummary: true,
      prescriptions: true,
    },
  });

  if (!appointment || appointment.doctorId !== session?.user.id) notFound();

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/doctor" className="text-sm text-blue-600 underline">
        &larr; Back
      </Link>
      <h1 className="mb-1 mt-2 text-2xl font-bold">{appointment.patient.name}</h1>
      <p className="mb-6 text-sm text-slate-600">
        {appointment.startTime.toLocaleString()} — status: {appointment.status}
      </p>

      {appointment.preVisitSummary && (
        <section className="mb-6 rounded border border-slate-300 p-4">
          <h2 className="mb-2 font-semibold">Pre-visit summary</h2>
          <p className="mb-1 text-sm">
            Urgency: <strong>{appointment.preVisitSummary.urgencyLevel}</strong>
          </p>
          <p className="mb-1 text-sm">Chief complaint: {appointment.preVisitSummary.chiefComplaint}</p>
          <p className="mb-1 text-sm font-medium">Suggested questions:</p>
          <ul className="list-disc pl-5 text-sm">
            {(appointment.preVisitSummary.suggestedQuestions as string[]).map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
          {appointment.symptomForm && (
            <p className="mt-2 text-sm text-slate-600">Reported symptoms: {appointment.symptomForm.symptoms}</p>
          )}
        </section>
      )}

      {appointment.status === "CONFIRMED" && (
        <div className="mb-6 flex flex-col gap-4">
          <PostVisitForm appointmentId={appointment.id} />
          <CancelAppointmentButton appointmentId={appointment.id} />
        </div>
      )}

      {appointment.postVisitSummary && (
        <section className="rounded border border-slate-300 p-4">
          <h2 className="mb-2 font-semibold">Post-visit summary</h2>
          <p className="whitespace-pre-line text-sm">{appointment.postVisitSummary.summary}</p>
          {appointment.prescriptions.length > 0 && (
            <>
              <p className="mt-3 text-sm font-medium">Prescriptions</p>
              <ul className="list-disc pl-5 text-sm">
                {appointment.prescriptions.map((p) => (
                  <li key={p.id}>
                    {p.medicationName} — {p.dosage}, {p.frequencyPerDay}x/day for {p.durationDays} days
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </main>
  );
}
