import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import UpgradeButton from "@/components/UpgradeButton";
import { PLANS } from "@/lib/plans";

export const metadata: Metadata = { title: "Pricing" };

const ORDER = ["FREE", "PRO", "BUSINESS"] as const;

export default function Pricing() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="text-center">
          <h1 className="text-4xl font-semibold tracking-tight text-slate-900">Simple pricing, per creator</h1>
          <p className="mt-4 text-slate-600">Viewers are always free. Only people who record need a paid seat.</p>
        </div>
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {ORDER.map((id) => {
            const p = PLANS[id];
            const featured = id === "PRO";
            return (
              <div key={id} className={`flex flex-col rounded-2xl border bg-white p-8 ${featured ? "border-brand-600 shadow-xl shadow-brand-900/10 ring-1 ring-brand-600" : "border-slate-200"}`}>
                {featured && <span className="mb-4 w-fit rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">Most popular</span>}
                <h2 className="text-lg font-semibold text-slate-900">{p.name}</h2>
                <p className="mt-4 flex items-baseline gap-1">
                  <span className="text-4xl font-semibold text-slate-900">${p.priceMonthly}</span>
                  <span className="text-sm text-slate-500">{p.priceMonthly ? "/ creator / month" : "forever"}</span>
                </p>
                <ul className="mt-8 flex-1 space-y-3 text-sm text-slate-700">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <svg className="mt-0.5 shrink-0 text-brand-600" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12l5 5L20 7" /></svg>
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="mt-8">
                  {id === "FREE" ? (
                    <Link href="/record" className="block rounded-xl border border-slate-300 px-4 py-3 text-center font-semibold text-slate-800 hover:bg-slate-50">Start free</Link>
                  ) : (
                    <UpgradeButton plan={id} featured={featured} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-10 text-center text-sm text-slate-500">Need 100+ client seats, invoicing or a security review? Contact sales.</p>
      </main>
      <SiteFooter />
    </>
  );
}
