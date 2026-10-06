"use client";

import { useState } from "react";

export default function UpgradeButton({ plan, featured = false }: { plan: "PRO" | "BUSINESS"; featured?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function go() {
    setBusy(true);
    setError(undefined);
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });
    if (res.status === 401) {
      window.location.href = `/login?next=${encodeURIComponent("/pricing")}`;
      return;
    }
    const data = await res.json().catch(() => ({}));
    if (data.url) window.location.href = data.url;
    else {
      setError(data.error ?? "Could not start checkout");
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={go}
        disabled={busy}
        className={`w-full rounded-xl px-4 py-3 font-semibold disabled:opacity-60 ${featured ? "bg-brand-600 text-white hover:bg-brand-700" : "bg-slate-900 text-white hover:bg-slate-800"}`}
      >
        {busy ? "Opening checkout…" : `Get ${plan === "PRO" ? "Pro" : "Business"}`}
      </button>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </>
  );
}
