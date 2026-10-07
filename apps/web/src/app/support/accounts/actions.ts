"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Plan } from "@prisma/client";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { PLANS } from "@/lib/plans";
import { isSupportAgent } from "@/lib/support/tickets";

export type CompResult = { ok: boolean; message: string } | null;

/** Gives (or takes back) a free paid plan on the workspace an email address owns. */
export async function setComplimentary(_prev: CompResult, form: FormData): Promise<CompResult> {
  const session = await auth();
  if (!isSupportAgent(session?.user?.email)) redirect("/library");
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const choice = String(form.get("plan") ?? "");
  if (!email.includes("@") || !(choice in PLANS)) return { ok: false, message: "Enter an email address and pick a plan." };
  const plan = choice as Plan;

  const owner = await db.membership.findFirst({ where: { role: "OWNER", user: { email } }, include: { workspace: true } });
  if (!owner) return { ok: false, message: `${email} hasn't signed up yet, or doesn't own a workspace. Ask them to sign in once first.` };
  const ws = owner.workspace;
  if (ws.stripeSubscriptionId) return { ok: false, message: `${ws.name} already pays for ${PLANS[ws.plan].name}, so nothing was changed.` };

  await db.workspace.update({
    where: { id: ws.id },
    data: plan === "FREE" ? { plan: "FREE", complimentaryPlan: null } : { plan, complimentaryPlan: plan },
  });
  revalidatePath("/support/accounts");
  return {
    ok: true,
    message: plan === "FREE" ? `${ws.name} is back on the Free plan.` : `${ws.name} now has ${PLANS[plan].name} free of charge.`,
  };
}
