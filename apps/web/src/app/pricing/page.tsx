import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import PricingTable from "@/components/PricingTable";

export const metadata: Metadata = { title: "Pricing" };

export default function Pricing() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="text-center">
          <h1 className="text-4xl font-semibold tracking-tight text-slate-900">Simple pricing. Clients always free.</h1>
          <p className="mt-4 text-slate-600">Pick a plan by how many clients you work with.</p>
        </div>
        <PricingTable />
        <p className="mt-10 text-center text-sm text-slate-500">More than 100 clients? Add extra clients for $1.50 a month each.</p>
      </main>
      <SiteFooter />
    </>
  );
}
