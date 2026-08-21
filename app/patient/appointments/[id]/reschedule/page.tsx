"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Slot {
  startTime: string;
  endTime: string;
}

interface Hold {
  id: string;
  startTime: string;
  expiresAt: string;
}

export default function RescheduleAppointmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [doctorName, setDoctorName] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [hold, setHold] = useState<Hold | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    fetch(`/api/appointments/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setDoctorId(data.appointment.doctor.id);
        setDoctorName(data.appointment.doctor.name);
      });
  }, [id]);

  useEffect(() => {
    if (!doctorId) return;
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
    if (!doctorId) return;
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

  async function handleConfirm() {
    if (!hold) return;
    setConfirming(true);
    setError(null);

    const res = await fetch(`/api/appointments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newHoldId: hold.id }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not reschedule appointment");
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
      <h1 className="mb-4 mt-2 text-2xl font-bold">Reschedule with Dr. {doctorName}</h1>

      {!hold && (
        <>
          {loadingSlots && <p className="text-sm text-slate-600">Loading available slots...</p>}
          {!loadingSlots && (
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
        <div className="flex flex-col gap-3">
          <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
            New slot held: {new Date(hold.startTime).toLocaleString()}. Confirm within {secondsLeft}s.
          </p>
          <button
            onClick={handleConfirm}
            disabled={confirming}
            className="w-fit rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {confirming ? "Rescheduling..." : "Confirm reschedule"}
          </button>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </main>
  );
}
