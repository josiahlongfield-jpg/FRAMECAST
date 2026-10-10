"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Plan } from "@prisma/client";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { enforceSeatLimits } from "@/lib/seatLimits";
import { PLANS } from "@/lib/plans";
import { logAdmin } from "@/lib/support/admin";
import { isSupportAgent } from "@/lib/support/tickets";
import { currentSubscription } from "@/lib/subscription";

export type CompResult = { ok: boolean; message: string } | null;

/** The support agent, for the support log. */
const agentOf = (session: { user?: { id?: string | null; email?: string | null } } | null) => ({ userId: session?.user?.id ?? "", email: session?.user?.email ?? "" });

/** Gives (or takes back) a free paid plan on the workspace an email address owns. */
export async function setComplimentary(_prev: CompResult, form: FormData): Promise<CompResult> {
  const session = await auth();
  if (!isSupportAgent(session?.user?.email)) redirect("/library");
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const choice = String(form.get("plan") ?? "");
  if (!email.includes("@") || !(choice in PLANS)) return { ok: false, message: "Enter an email address and pick a plan." };
  const plan = choice as Plan;

  const owner = await db.membership.findFirst({ where: { role: "OWNER", user: { email } }, include: { workspace: true }, orderBy: { workspace: { createdAt: "asc" } } });
  if (!owner) return { ok: false, message: `${email} hasn't signed up yet, or doesn't own a workspace. Ask them to sign in once first.` };
  // A subscription Stripe no longer has (say one from test mode) is cleared here, not counted as paying.
  const ws = (await currentSubscription(owner.workspace)) ? owner.workspace : await db.workspace.findUniqueOrThrow({ where: { id: owner.workspaceId } });
  if (ws.stripeSubscriptionId) return { ok: false, message: `${ws.name} already pays for ${PLANS[ws.plan].name}, so nothing was changed.` };

  await db.$transaction(async (tx) => {
    const after = await tx.workspace.update({
      where: { id: ws.id },
      // Free AI summaries only come with a free plan.
      data: plan === "FREE" ? { plan: "FREE", complimentaryPlan: null, aiAssistComplimentary: false, aiAssist: false } : { plan, complimentaryPlan: plan },
    });
    await logAdmin(tx, agentOf(session), {
      action: "plan.complimentary",
      workspaceId: ws.id,
      userId: owner.userId,
      target: `${ws.name} (${email})`,
      details: {
        before: { plan: ws.plan, complimentaryPlan: ws.complimentaryPlan, aiAssist: ws.aiAssist, aiAssistComplimentary: ws.aiAssistComplimentary },
        after: { plan: after.plan, complimentaryPlan: after.complimentaryPlan, aiAssist: after.aiAssist, aiAssistComplimentary: after.aiAssistComplimentary },
      },
    });
  });
  await enforceSeatLimits(ws.id);
  revalidatePath("/support/accounts");
  return {
    ok: true,
    message: plan === "FREE" ? `${ws.name} is back on the Free plan.` : `${ws.name} now has ${PLANS[plan].name} free of charge.`,
  };
}

/** Gives (or takes back) the AI summaries add-on, free, on a workspace with a complimentary plan. */
export async function setComplimentaryAi(_prev: CompResult, form: FormData): Promise<CompResult> {
  const session = await auth();
  if (!isSupportAgent(session?.user?.email)) redirect("/library");
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const on = form.get("ai") === "on";
  if (!email.includes("@")) return { ok: false, message: "Enter an email address." };

  const owner = await db.membership.findFirst({ where: { role: "OWNER", user: { email } }, include: { workspace: true }, orderBy: { workspace: { createdAt: "asc" } } });
  if (!owner) return { ok: false, message: `${email} hasn't signed up yet, or doesn't own a workspace. Ask them to sign in once first.` };
  const ws = (await currentSubscription(owner.workspace)) ? owner.workspace : await db.workspace.findUniqueOrThrow({ where: { id: owner.workspaceId } });
  if (ws.stripeSubscriptionId) return { ok: false, message: `${ws.name} pays by card, so they can add AI summaries in Settings > Billing. Nothing was changed.` };
  if (on && !ws.complimentaryPlan) return { ok: false, message: `Give ${ws.name} a free paid plan first. AI summaries aren't available on Free.` };

  await db.$transaction(async (tx) => {
    await tx.workspace.update({ where: { id: ws.id }, data: { aiAssistComplimentary: on, aiAssist: on } });
    await logAdmin(tx, agentOf(session), {
      action: "plan.complimentary_ai",
      workspaceId: ws.id,
      userId: owner.userId,
      target: `${ws.name} (${email})`,
      details: { before: { aiAssist: ws.aiAssist, aiAssistComplimentary: ws.aiAssistComplimentary }, after: { aiAssist: on, aiAssistComplimentary: on } },
    });
  });
  revalidatePath("/support/accounts");
  return {
    ok: true,
    message: on
      ? `${ws.name} now has AI summaries free of charge, switched on. Their owner can switch it off in Settings > Billing.`
      : `AI summaries are off for ${ws.name}.`,
  };
}
