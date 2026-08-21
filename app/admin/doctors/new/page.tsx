"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;

type DayHours = { enabled: boolean; start: string; end: string };

export default function NewDoctorPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [specialisation, setSpecialisation] = useState("");
  const [slotDurationMinutes, setSlotDurationMinutes] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState<Record<string, DayHours>>(() =>
    Object.fromEntries(
      WEEKDAYS.map((day) => [day, { enabled: day !== "SAT" && day !== "SUN", start: "09:00", end: "17:00" }])
    )
  );

  function updateDay(day: string, patch: Partial<DayHours>) {
    setDays((prev) => ({ ...prev, [day]: { ...prev[day], ...patch } }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const workingHours = Object.fromEntries(
      Object.entries(days)
        .filter(([, v]) => v.enabled)
        .map(([day, v]) => [day, { start: v.start, end: v.end }])
    );

    const res = await fetch("/api/admin/doctors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, specialisation, slotDurationMinutes, workingHours }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to create doctor");
      setLoading(false);
      return;
    }

    router.push("/admin");
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <Link href="/admin" className="text-sm text-blue-600 underline">
        &larr; Back
      </Link>
      <h1 className="mb-4 mt-2 text-2xl font-bold">Add doctor</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          placeholder="Full name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded border border-slate-300 px-3 py-2"
        />
        <input
          type="email"
          placeholder="Email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded border border-slate-300 px-3 py-2"
        />
        <input
          type="password"
          placeholder="Temporary password (min 8 characters)"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded border border-slate-300 px-3 py-2"
        />
        <input
          placeholder="Specialisation"
          required
          value={specialisation}
          onChange={(e) => setSpecialisation(e.target.value)}
          className="rounded border border-slate-300 px-3 py-2"
        />
        <label className="flex items-center gap-2 text-sm">
          Slot duration (minutes)
          <input
            type="number"
            min={5}
            max={240}
            value={slotDurationMinutes}
            onChange={(e) => setSlotDurationMinutes(Number(e.target.value))}
            className="w-24 rounded border border-slate-300 px-2 py-1"
          />
        </label>

        <fieldset className="rounded border border-slate-300 p-3">
          <legend className="px-1 text-sm font-medium">Working hours</legend>
          <div className="flex flex-col gap-2">
            {WEEKDAYS.map((day) => (
              <div key={day} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={days[day].enabled}
                  onChange={(e) => updateDay(day, { enabled: e.target.checked })}
                />
                <span className="w-10">{day}</span>
                <input
                  type="time"
                  disabled={!days[day].enabled}
                  value={days[day].start}
                  onChange={(e) => updateDay(day, { start: e.target.value })}
                  className="rounded border border-slate-300 px-2 py-1 disabled:bg-slate-100"
                />
                <span>to</span>
                <input
                  type="time"
                  disabled={!days[day].enabled}
                  value={days[day].end}
                  onChange={(e) => updateDay(day, { end: e.target.value })}
                  className="rounded border border-slate-300 px-2 py-1 disabled:bg-slate-100"
                />
              </div>
            ))}
          </div>
        </fieldset>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Creating..." : "Create doctor"}
        </button>
      </form>
    </main>
  );
}
