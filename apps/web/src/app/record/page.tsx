import type { Metadata } from "next";
import AppHeader from "@/components/AppHeader";
import Recorder from "@/components/Recorder";
import { PLANS } from "@/lib/plans";
import { requirePageUser } from "@/lib/session";

export const metadata: Metadata = { title: "New recording" };

export default async function RecordPage() {
  const { user, workspace } = await requirePageUser("/record");
  const plan = PLANS[workspace.plan];
  return (
    <>
      <AppHeader email={user.email} plan={plan.name} />
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight text-slate-900">New recording</h1>
        <Recorder maxResolution={plan.maxResolution} maxDurationMin={plan.maxDurationMin} />
      </main>
    </>
  );
}
