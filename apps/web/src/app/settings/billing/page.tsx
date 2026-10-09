import type { Metadata } from "next";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import ManageBillingButton from "@/components/ManageBillingButton";
import CloudBackupToggle from "@/components/CloudBackupToggle";
import AiAssistToggle from "@/components/AiAssistToggle";
import { summaryUsage } from "@/lib/ai/summary";
import { readManifest } from "@/lib/ai/speechModel";
import { RETENTION_DAYS } from "@/lib/retention";
import { AI_ASSIST_PRICES, aiAssistActive, CLOUD_BACKUP_PRICE, PLANS } from "@/lib/plans";
import type { Workspace } from "@prisma/client";
import { requirePageUser } from "@/lib/session";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: "Billing" };

/** The AI summaries add-on for this workspace's plan. */
async function AiAddOn({ workspace }: { workspace: Workspace }) {
  const paid = workspace.plan !== "FREE" ? AI_ASSIST_PRICES[workspace.plan] : null;
  const free = workspace.aiAssistComplimentary && workspace.plan !== "FREE";
  return (
    <AiAssistToggle
      enabled={aiAssistActive(workspace)}
      canEnable={free || (!!paid && !!workspace.stripeSubscriptionId)}
      priceLabel={free || !paid ? null : `US$${paid.month} per month on ${PLANS[workspace.plan].name} (US$${paid.year} per year on yearly billing)`}
      usage={aiAssistActive(workspace) ? await summaryUsage(workspace) : null}
      modelReady={!!(await readManifest().catch(() => null))}
    />
  );
}

export default async function Billing({ searchParams }: { searchParams: Promise<{ upgraded?: string }> }) {
  const { upgraded } = await searchParams;
  const { user, workspace, role } = await requirePageUser(upgraded ? "/settings/billing?upgraded=1" : "/settings/billing");
  const plan = PLANS[workspace.plan];
  const comp = !!workspace.complimentaryPlan && !workspace.stripeSubscriptionId;
  if (role !== "OWNER") {
    return (
      <>
        <AppHeader email={user.email} plan={plan.name} />
        <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Billing</h1>
          <p className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
            {workspace.name} is on the {plan.name} plan. Only the workspace owner can change the plan or billing.
          </p>
        </main>
      </>
    );
  }
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
          {comp && (
            <p className="mt-1 text-sm text-emerald-700">Complimentary from {BRAND.name}. No card needed. Upgrading starts a paid subscription and keeps everything as it is.</p>
          )}
          {workspace.currentPeriodEnd && (
            <p className="mt-1 text-sm text-slate-500">
              Renews {workspace.currentPeriodEnd.toLocaleDateString("en-US", { dateStyle: "long" })}
            </p>
          )}
          {plan.showsPromo && (
            <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
              Your clients see a short SureFrame intro before each video. Any paid plan removes it and shows your own branding instead.
            </p>
          )}
          <ul className="mt-4 space-y-1 text-sm text-slate-700">
            {plan.features.map((f) => <li key={f}>• {f}</li>)}
          </ul>
          <div className="mt-6 flex gap-3">
            {workspace.stripeCustomerId && <ManageBillingButton />}
            {(workspace.plan !== "AGENCY" || comp) && (
              <Link href="/pricing" className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">{comp ? "Choose a paid plan" : "Upgrade"}</Link>
            )}
          </div>
        </div>
        <CloudBackupToggle enabled={workspace.cloudBackup} canEnable={workspace.plan !== "FREE"} price={CLOUD_BACKUP_PRICE} days={RETENTION_DAYS} />
        <AiAddOn workspace={workspace} />
      </main>
    </>
  );
}
