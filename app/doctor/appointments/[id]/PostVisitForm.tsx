"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface PrescriptionDraft {
  medicationName: string;
  dosage: string;
  frequencyPerDay: number;
  durationDays: number;
}

const EMPTY_PRESCRIPTION: PrescriptionDraft = { medicationName: "", dosage: "", frequencyPerDay: 1, durationDays: 7 };

export function PostVisitForm({ appointmentId }: { appointmentId: string }) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [prescriptions, setPrescriptions] = useState<PrescriptionDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function addPrescription() {
    setPrescriptions((prev) => [...prev, { ...EMPTY_PRESCRIPTION }]);
  }

  function updatePrescription(index: number, patch: Partial<PrescriptionDraft>) {
    setPrescriptions((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  function removePrescription(index: number) {
    setPrescriptions((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch(`/api/appointments/${appointmentId}/post-visit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes, prescriptions }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to save visit notes");
      setLoading(false);
      return;
    }

    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded border border-slate-300 p-4">
      <h3 className="font-medium">Complete visit</h3>
      <textarea
        placeholder="Clinical notes"
        required
        rows={4}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className="rounded border border-slate-300 px-3 py-2"
      />

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Prescriptions</span>
          <button type="button" onClick={addPrescription} className="text-sm text-blue-600 underline">
            + Add medication
          </button>
        </div>
        {prescriptions.map((p, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 rounded border border-slate-200 p-2">
            <input
              placeholder="Medication"
              required
              value={p.medicationName}
              onChange={(e) => updatePrescription(i, { medicationName: e.target.value })}
              className="w-40 rounded border border-slate-300 px-2 py-1 text-sm"
            />
            <input
              placeholder="Dosage"
              required
              value={p.dosage}
              onChange={(e) => updatePrescription(i, { dosage: e.target.value })}
              className="w-28 rounded border border-slate-300 px-2 py-1 text-sm"
            />
            <label className="flex items-center gap-1 text-sm">
              x/day
              <input
                type="number"
                min={1}
                max={8}
                value={p.frequencyPerDay}
                onChange={(e) => updatePrescription(i, { frequencyPerDay: Number(e.target.value) })}
                className="w-16 rounded border border-slate-300 px-2 py-1"
              />
            </label>
            <label className="flex items-center gap-1 text-sm">
              days
              <input
                type="number"
                min={1}
                max={90}
                value={p.durationDays}
                onChange={(e) => updatePrescription(i, { durationDays: Number(e.target.value) })}
                className="w-16 rounded border border-slate-300 px-2 py-1"
              />
            </label>
            <button type="button" onClick={() => removePrescription(i)} className="text-sm text-red-600 underline">
              Remove
            </button>
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-fit rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? "Saving..." : "Complete visit"}
      </button>
    </form>
  );
}
