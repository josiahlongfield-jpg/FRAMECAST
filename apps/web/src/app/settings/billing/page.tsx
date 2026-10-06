import type { Metadata } from "next";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import ManageBillingButton from "@/components/ManageBillingButton";
import CloudBackupToggle from "@/components/CloudBackupToggle";
import { RETENTION_DAYS } from "@/lib/retention";
import { CLOUD_BACKUP_PRICE, PLANS } from "@/lib/plans";
import { requirePageUser } from "@/lib/session";

export const metadata: Metadata = { title: "Billing" };

export default async function Billing({ searchParams }: { searchParams: Promise<{ upgraded?: string }> }) {
  const { upgraded } = await searchParams;
  const { user, workspace } = await requirePageUser("/settings/billing");
  const plan = PLANS[workspace.plan];
  return (
    <>
      <AppHeader email={user.email} plan={plan.name} />
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Billing</h1>
        {upgraded && (
          <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            Thanks for upgrading. Your plan updates as soon as payment is confirmed.
          </p>
        )}
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
          <p className="text-sm text-slate-500">{workspace.name}</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">{plan.name} plan</p>
          {workspace.currentPeriodEnd && (
            <p className="mt-1 text-sm text-slate-500">
              Renews {workspace.currentPeriodEnd.toLocaleDateString("en-US", { dateStyle: "long" })}
            </p>
          )}
          <ul className="mt-4 space-y-1 text-sm text-slate-700">
            {plan.features.map((f) => <li key={f}>• {f}</li>)}
          </ul>
          <div className="mt-6 flex gap-3">
            {workspace.stripeCustomerId && <ManageBillingButton />}
            {workspace.plan !== "BUSINESS" && (
              <Link href="/pricing" className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">Upgrade</Link>
            )}
          </div>
        </div>
        <CloudBackupToggle enabled={workspace.cloudBackup} canEnable={workspace.plan !== "FREE"} price={CLOUD_BACKUP_PRICE} days={RETENTION_DAYS} />
      </main>
    </>
  );
}
