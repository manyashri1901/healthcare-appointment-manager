"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Doctor {
  id: string;
  name: string;
  doctorProfile: { specialisation: string; slotDurationMinutes: number } | null;
}

interface Slot {
  startTime: string;
  endTime: string;
}

interface Hold {
  id: string;
  startTime: string;
  expiresAt: string;
}

export default function BookAppointmentPage() {
  const router = useRouter();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [doctorId, setDoctorId] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [hold, setHold] = useState<Hold | null>(null);
  const [symptoms, setSymptoms] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    fetch("/api/doctors")
      .then((r) => r.json())
      .then((data) => setDoctors(data.doctors ?? []));
  }, []);

  useEffect(() => {
    if (!doctorId) {
      setSlots([]);
      return;
    }
    setLoadingSlots(true);
    fetch(`/api/doctors/${doctorId}/slots`)
      .then((r) => r.json())
      .then((data) => setSlots(data.slots ?? []))
      .finally(() => setLoadingSlots(false));
  }, [doctorId]);

  useEffect(() => {
    if (!hold) return;
    const tick = () => {
      const remaining = Math.max(0, Math.floor((new Date(hold.expiresAt).getTime() - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0) {
        setHold(null);
        setError("Your hold expired. Please pick a slot again.");
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [hold]);

  async function selectSlot(slot: Slot) {
    setError(null);
    const res = await fetch("/api/appointments/hold", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doctorId, startTime: slot.startTime }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Could not hold this slot");
      return;
    }
    setHold(data.hold);
  }

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    if (!hold) return;
    setConfirming(true);
    setError(null);

    const res = await fetch("/api/appointments/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ holdId: hold.id, symptoms: symptoms || undefined }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not confirm appointment");
      setConfirming(false);
      return;
    }

    router.push("/patient");
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/patient" className="text-sm text-blue-600 underline">
        &larr; Back
      </Link>
      <h1 className="mb-4 mt-2 text-2xl font-bold">Book an appointment</h1>

      {!hold && (
        <>
          <label className="mb-4 flex flex-col gap-1">
            <span className="text-sm font-medium">Doctor</span>
            <select
              value={doctorId}
              onChange={(e) => setDoctorId(e.target.value)}
              className="rounded border border-slate-300 px-3 py-2"
            >
              <option value="">Select a doctor</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  Dr. {d.name} — {d.doctorProfile?.specialisation}
                </option>
              ))}
            </select>
          </label>

          {loadingSlots && <p className="text-sm text-slate-600">Loading available slots...</p>}

          {!loadingSlots && doctorId && (
            <div className="grid grid-cols-3 gap-2">
              {slots.map((slot) => (
                <button
                  key={slot.startTime}
                  onClick={() => selectSlot(slot)}
                  className="rounded border border-slate-300 px-2 py-2 text-sm hover:bg-blue-50"
                >
                  {new Date(slot.startTime).toLocaleString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </button>
              ))}
              {slots.length === 0 && <p className="col-span-3 text-sm text-slate-600">No slots available this week.</p>}
            </div>
          )}
        </>
      )}

      {hold && (
        <form onSubmit={handleConfirm} className="flex flex-col gap-3">
          <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Slot held: {new Date(hold.startTime).toLocaleString()}. Confirm within {secondsLeft}s.
          </p>
          <textarea
            placeholder="Describe your symptoms (optional, helps the doctor prepare)"
            rows={4}
            value={symptoms}
            onChange={(e) => setSymptoms(e.target.value)}
            className="rounded border border-slate-300 px-3 py-2"
          />
          <button
            type="submit"
            disabled={confirming}
            className="w-fit rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {confirming ? "Confirming..." : "Confirm appointment"}
          </button>
        </form>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </main>
  );
}
