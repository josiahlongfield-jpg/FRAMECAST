import type { ReactNode } from "react";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import { LEGAL, SUBPROCESSORS } from "@/lib/legal";

/** Our service providers, as one list for the privacy policy and the DPA (`customerData` for the DPA's Annex 3). */
export function SubprocessorList({ customerData = false }: { customerData?: boolean }) {
  return (
    <ul>
      {SUBPROCESSORS.filter((s) => !customerData || s.customerData).map((s) => (
        <li key={s.name}>
          <strong>{s.name}</strong> ({s.purpose}): {s.data}.{s.location && ` Location: ${s.location}.`}
        </li>
      ))}
    </ul>
  );
}

/**
 * Shared layout for the terms, privacy policy and data processing agreement.
 * Headings get a scroll margin so links to their ids clear the sticky header.
 */
export default function LegalPage({ title, version, updated = LEGAL.updated, children }: { title: string; version?: string; updated?: string; children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{title}</h1>
        <p className="mt-2 text-sm text-slate-500">
          {version && `Version ${version} · `}Last updated {updated}
        </p>
        <div className="legal mt-8 space-y-4 text-[15px] leading-7 text-slate-700 [&_h2]:mt-10 [&_h2]:scroll-mt-20 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-slate-900 [&_h3]:mt-6 [&_h3]:scroll-mt-20 [&_h3]:font-semibold [&_h3]:text-slate-900 [&_a]:text-brand-700 [&_a]:underline [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1 [&_li>ul]:mt-1">
          {children}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
