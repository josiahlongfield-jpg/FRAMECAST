"use client";

import { useState } from "react";

export default function CloudBackupToggle({ enabled, canEnable, price, days }: { enabled: boolean; canEnable: boolean; price: number; days: number }) {
  const [on, setOn] = useState(enabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function toggle() {
    setBusy(true);
    setError(undefined);
    const res = await fetch("/api/billing/backup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !on }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "Could not change cloud backup");
    setOn(data.cloudBackup);
  }

  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-semibold text-slate-900">Cloud backup</p>
          <p className="mt-1 text-sm text-slate-600">
            Your videos live on your devices and are end-to-end encrypted. We only relay an encrypted copy so clients can watch it, and delete it after {days} days.
            Cloud backup keeps those encrypted copies until you delete them. We still can&apos;t open them.
          </p>
          <p className="mt-2 text-xs text-slate-500">${price} per month, optional.</p>
        </div>
        <button
          role="switch"
          aria-checked={on}
          aria-label="Cloud backup"
          onClick={toggle}
          disabled={busy || (!on && !canEnable)}
          className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50 ${on ? "bg-brand-600" : "bg-slate-300"}`}
        >
          <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${on ? "left-6" : "left-1"}`} />
        </button>
      </div>
      {!canEnable && !on && <p className="mt-3 text-sm text-slate-600">Available on paid plans.</p>}
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    </div>
  );
}
