"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LeaveForm({ doctorId }: { doctorId: string }) {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const res = await fetch(`/api/admin/doctors/${doctorId}/leave`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, reason: reason || undefined }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setMessage(data.error ?? "Failed to mark leave");
    } else {
      setMessage(
        `Leave recorded. ${data.cancelledAppointmentCount} appointment(s) cancelled and patients notified.`
      );
      router.refresh();
    }
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 rounded border border-slate-300 p-4">
      <h3 className="font-medium">Mark a leave day</h3>
      <input
        type="date"
        required
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="rounded border border-slate-300 px-3 py-2"
      />
      <input
        placeholder="Reason (optional)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="rounded border border-slate-300 px-3 py-2"
      />
      {message && <p className="text-sm text-slate-700">{message}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-fit rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? "Saving..." : "Mark leave"}
      </button>
    </form>
  );
}
