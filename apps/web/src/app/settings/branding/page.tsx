import type { Metadata } from "next";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import BrandingForm from "@/components/BrandingForm";
import { brandOf } from "@/lib/branding";
import { PLANS } from "@/lib/plans";
import { requirePageUser } from "@/lib/session";

export const metadata: Metadata = { title: "Branding" };

export default async function BrandingSettings() {
  const { user, workspace } = await requirePageUser("/settings/branding");
  const brand = brandOf({ ...workspace, plan: "PRO" });
  return (
    <>
      <AppHeader email={user.email} plan={PLANS[workspace.plan].name} />
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Branding</h1>
        <p className="mt-1 text-sm text-slate-500">
          Your logo and colour on the pages and reminder emails your clients see. Your business name comes from{" "}
          <Link href="/settings/reminders" className="font-medium text-brand-700 hover:underline">Reminders settings</Link>.
        </p>
        {workspace.plan === "FREE" ? (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
            <p className="text-slate-700">Custom branding is part of Pro and Business.</p>
            <Link href="/pricing" className="mt-4 inline-block rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">See plans</Link>
          </div>
        ) : (
          <BrandingForm workspaceId={workspace.id} name={workspace.name} color={brand.color} logoUrl={brand.logoUrl} />
        )}
      </main>
    </>
  );
}
