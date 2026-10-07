"use client";

import { useActionState } from "react";
import { setComplimentary } from "./actions";

export default function CompForm({ plans }: { plans: { id: string; name: string }[] }) {
  const [result, action, pending] = useActionState(setComplimentary, null);
  return (
    <form action={action} className="mt-4 rounded-2xl border border-slate-200 bg-white p-6">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <input name="email" type="email" required placeholder="Their sign-in email" className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
        <select name="plan" defaultValue="STUDIO" className="rounded-xl border border-slate-300 px-3 py-2 text-sm">
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.id === "FREE" ? "Back to Free" : p.name}
            </option>
          ))}
        </select>
        <button disabled={pending} className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      {result && <p className={`mt-3 text-sm ${result.ok ? "text-emerald-700" : "text-red-700"}`}>{result.message}</p>}
    </form>
  );
}
