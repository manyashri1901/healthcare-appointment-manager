import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SignOutButton } from "@/app/components/SignOutButton";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await getServerSession(authOptions);

  const doctors = await prisma.user.findMany({
    where: { role: "DOCTOR" },
    select: { id: true, name: true, email: true, doctorProfile: { select: { specialisation: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Admin dashboard</h1>
          <p className="text-sm text-slate-600">Signed in as {session?.user?.name}</p>
        </div>
        <SignOutButton />
      </div>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Doctors</h2>
        <Link href="/admin/doctors/new" className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700">
          Add doctor
        </Link>
      </div>

      <ul className="divide-y divide-slate-200 rounded border border-slate-200">
        {doctors.map((doctor) => (
          <li key={doctor.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="font-medium">{doctor.name}</p>
              <p className="text-sm text-slate-600">
                {doctor.email} — {doctor.doctorProfile?.specialisation ?? "No profile"}
              </p>
            </div>
            <Link href={`/admin/doctors/${doctor.id}`} className="text-sm text-blue-600 underline">
              Manage
            </Link>
          </li>
        ))}
        {doctors.length === 0 && <li className="px-4 py-3 text-sm text-slate-600">No doctors yet.</li>}
      </ul>
    </main>
  );
}
