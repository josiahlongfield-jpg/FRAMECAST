import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import PricingTable from "@/components/PricingTable";
import { RETENTION_DAYS } from "@/lib/retention";
import { AI_ASSIST_PRICES, AI_SUMMARIES_PER_MONTH, CLOUD_BACKUP_PRICE, CLOUD_BACKUP_PRICE_YEARLY, PLANS } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Simple plans priced by how many clients you work with, in US dollars. Clients always join free. Optional cloud backup and AI add-ons.",
};

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
        <p className="mt-10 text-center text-sm text-slate-500">More than 100 clients? Add extra clients for US$1.50 a month each.</p>
        <p className="mt-2 text-center text-sm text-slate-500" data-testid="currency-note">All prices are in US dollars (USD), plus any sales tax, VAT or GST that applies where you are. Checkout may offer to charge you in your own currency at Stripe&rsquo;s exchange rate; otherwise your bank converts it.</p>

        <section className="mx-auto mt-16 max-w-3xl" aria-labelledby="add-ons">
          <h2 id="add-ons" className="text-center text-2xl font-semibold tracking-tight text-slate-900">Optional add-ons</h2>
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-6" data-testid="addon-ai">
              <h3 className="font-semibold text-slate-900">AI transcripts and summaries</h3>
              <p className="mt-2 text-sm text-slate-600">
                A transcript and a short summary with key points and action items under each video, for your team and your client. The transcript is made on your own
                device and the audio isn&apos;t sent anywhere for it; only the transcript text is sent to Anthropic&apos;s Claude to write the summary. AI summaries can contain mistakes. Videos up to 30 minutes.
              </p>
              <ul className="mt-4 space-y-1 text-sm text-slate-700">
                {(["SOLO", "STUDIO", "AGENCY"] as const).map((id) => (
                  <li key={id} className="flex justify-between gap-3">
                    <span>{PLANS[id].name}</span>
                    <span>
                      US${AI_ASSIST_PRICES[id].month}/month or US${AI_ASSIST_PRICES[id].year}/year · up to {AI_SUMMARIES_PER_MONTH[id]} summaries a month
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-slate-500">Not available on Free. Off unless you switch it on. Works best on a computer.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-semibold text-slate-900">Cloud backup</h3>
              <p className="mt-2 text-sm text-slate-600">Keep the encrypted copies of your videos on our servers until you delete them, instead of for {RETENTION_DAYS} days. We still can&apos;t open them.</p>
              <p className="mt-4 text-sm text-slate-700">US${CLOUD_BACKUP_PRICE}/month or US${CLOUD_BACKUP_PRICE_YEARLY}/year on any paid plan</p>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
