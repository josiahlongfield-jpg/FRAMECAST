"use client";

import Link from "next/link";
import { useState } from "react";
import UpgradeButton from "@/components/UpgradeButton";
import { PLANS, type Interval } from "@/lib/plans";

const ORDER = ["FREE", "SOLO", "STUDIO", "AGENCY"] as const;
const FEATURED = "STUDIO";

export default function PricingTable() {
  const [interval, setInterval] = useState<Interval>("month");
  return (
    <>
      <div className="mt-10 flex justify-center">
        <div role="radiogroup" aria-label="Billing period" className="inline-flex rounded-xl border border-slate-200 bg-white p-1 text-sm font-medium">
          {(["month", "year"] as const).map((i) => (
            <button
              key={i}
              role="radio"
              aria-checked={interval === i}
              onClick={() => setInterval(i)}
              className={`rounded-lg px-4 py-2 ${interval === i ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"}`}
            >
              {i === "month" ? "Monthly" : "Yearly (2 months free)"}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {ORDER.map((id) => {
          const p = PLANS[id];
          const featured = id === FEATURED;
          const price = interval === "year" ? p.priceYearly : p.priceMonthly;
          return (
            <div key={id} className={`relative flex flex-col rounded-2xl border bg-white p-6 ${featured ? "border-brand-600 shadow-xl shadow-brand-900/10 ring-1 ring-brand-600" : "border-slate-200"}`}>
              {featured && <span className="absolute -top-3 left-6 w-fit rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold text-white">Best for teams</span>}
              <h2 className="text-lg font-semibold text-slate-900">{p.name}</h2>
              <p className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-semibold text-slate-900">{price > 0 && <span className="text-xl align-top">US</span>}${price}</span>
                <span className="text-sm text-slate-500">{price ? `/ ${interval}` : "free"}</span>
              </p>
              {interval === "year" && price > 0 && <p className="mt-1 text-xs text-slate-500">US${(price / 12).toFixed(2)} a month, billed yearly</p>}
              <ul className="mt-6 flex-1 space-y-3 text-sm text-slate-700">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <svg className="mt-0.5 shrink-0 text-brand-600" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                {id === "FREE" ? (
                  <Link href="/record" className="block rounded-xl border border-slate-300 px-4 py-3 text-center font-semibold text-slate-800 hover:bg-slate-50">Start free</Link>
                ) : (
                  <UpgradeButton plan={id} interval={interval} featured={featured} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
