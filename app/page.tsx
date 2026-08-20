import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-3xl font-bold">Healthcare Appointment & Follow-up Manager</h1>
      <p className="text-slate-600">
        Book appointments, submit symptoms ahead of your visit, and keep track of
        follow-ups and prescriptions.
      </p>
      <div className="flex gap-4">
        <Link href="/login" className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
          Sign in
        </Link>
        <Link href="/register" className="rounded border border-blue-600 px-4 py-2 text-blue-600 hover:bg-blue-50">
          Register
        </Link>
      </div>
    </main>
  );
}
