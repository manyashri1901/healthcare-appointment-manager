"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CancelAppointmentButton({ appointmentId }: { appointmentId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleCancel() {
    if (!confirm("Cancel this appointment?")) return;
    setLoading(true);
    const res = await fetch(`/api/appointments/${appointmentId}/cancel`, { method: "POST" });
    setLoading(false);
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "Failed to cancel appointment");
    }
  }

  return (
    <button
      onClick={handleCancel}
      disabled={loading}
      className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
    >
      {loading ? "Cancelling..." : "Cancel"}
    </button>
  );
}
