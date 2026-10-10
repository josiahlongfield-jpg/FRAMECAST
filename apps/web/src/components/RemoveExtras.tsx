"use client";

import { useState } from "react";

/**
 * Lowers extra client seats or staff logins the owner bought. Only unused ones
 * can go; the unused time is credited on the next bill.
 */
export default function RemoveExtras({
  extra,
  spare,
  noun,
  endpoint,
  field,
  onError,
}: {
  /** How many extras are bought now. */
  extra: number;
  /** How many of them aren't in use. */
  spare: number;
  noun: { one: string; many: string; holder: string };
  endpoint: string;
  field: "extraSeats" | "extraStaff";
  onError: (message: string) => void;
}) {
  const removable = Math.min(extra, spare);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  if (extra <= 0) return null;
  if (removable <= 0) {
    return <p className="w-full text-xs text-slate-500">To stop paying for extra {noun.many}, remove {noun.holder} first; every one is in use.</p>;
  }

  async function remove() {
    const n = Math.min(qty, removable);
    if (!confirm(`Remove ${n} extra ${n === 1 ? noun.one : noun.many}? You stop paying for ${n === 1 ? "it" : "them"} now, and the unused time is credited to your next bill.`)) return;
    setBusy(true);
    const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [field]: extra - n }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return onError(data.error ?? `Could not remove ${noun.many}`);
    window.location.reload();
  }

  return (
    <span className="flex flex-wrap items-center gap-2" data-testid={`remove-${field}`}>
      <span className="text-slate-700">Fewer needed?</span>
      <select value={Math.min(qty, removable)} onChange={(e) => setQty(Number(e.target.value))} aria-label={`Extra ${noun.many} to remove`} className="rounded-lg border border-slate-300 bg-white px-2 py-1.5">
        {Array.from({ length: Math.min(removable, 50) }, (_, i) => i + 1).map((n) => (
          <option key={n} value={n}>{n} {n === 1 ? noun.one : noun.many}</option>
        ))}
      </select>
      <button onClick={remove} disabled={busy} className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60">Remove</button>
    </span>
  );
}
