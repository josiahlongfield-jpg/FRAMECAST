import { z } from "zod";
import { db } from "@/lib/db";
import { ACTIVE_STATUSES, AI_ITEM, catalogKey, catalogOf, changeAddOns, intervalOf, isAiItem, planOf, priceId, unpaid } from "@/lib/billing";
import { aiConfigured } from "@/lib/ai/summary";
import { readManifest } from "@/lib/ai/speechModel";
import { handle, HttpError, requireRole, requireUser } from "@/lib/session";
import { currentSubscription } from "@/lib/subscription";
import { limitByIp } from "@/lib/rateLimit";
import type { PaidPlan } from "@/lib/plans";

const Body = z.object({ enabled: z.boolean() });

/**
 * Optional paid add-on: AI transcripts and summaries. The owner
 * switches it on; it's added to the subscription at the plan's add-on price,
 * or switched on free when the founder has given it with a complimentary plan.
 */
export const POST = handle(async (req: Request) => {
  const me = await requireUser();
  requireRole(me, "OWNER");
  const { workspace } = me;
  const body = Body.safeParse(await req.json());
  await limitByIp("billing", 20, 600);
  if (!body.success) throw new HttpError(400, "Invalid request");
  const enabled = body.data.enabled;

  if (enabled && workspace.plan === "FREE") throw new HttpError(400, "AI summaries are available on paid plans");
  // Nobody pays for transcripts before devices can make them.
  if (enabled && !workspace.aiAssist && !workspace.aiAssistComplimentary && (!aiConfigured() || !(await readManifest().catch(() => null)))) {
    throw new HttpError(503, "AI transcripts and summaries aren't ready yet. We're setting them up; please try again soon.");
  }

  const sub = await currentSubscription(workspace);
  if (sub) {
    const active = ACTIVE_STATUSES.has(sub.status);
    const existing = sub.items.data.filter((i) => isAiItem(catalogOf(i.price)?.item));
    if (enabled && !workspace.aiAssistComplimentary) {
      if (!active) throw new HttpError(400, "Your subscription is not active");
      const plan = sub.items.data.map((i) => planOf(i.price)).find(Boolean) as PaidPlan | undefined;
      if (!plan) throw new HttpError(400, "AI summaries are available on paid plans");
      const price = await priceId(catalogKey(AI_ITEM[plan], intervalOf(sub)));
      if (!existing.some((i) => i.price.id === price)) {
        const charge = await changeAddOns(sub, [{ price, quantity: 1 }, ...existing.map((i) => ({ id: i.id, deleted: true }))], { adds: true });
        if (!charge.paid) return unpaid(charge);
      }
    }
    // Switched off, it comes off the subscription whatever its state (an unpaid one included),
    // so it isn't billed again or switched back on by the next update from Stripe.
    if (!enabled && existing.length) {
      if (!active && sub.status.startsWith("incomplete")) throw new HttpError(409, "Finish or cancel the pending payment first, under Manage subscription.");
      await changeAddOns(sub, existing.map((i) => ({ id: i.id, deleted: true })), { adds: false });
    }
  } else if (enabled && !workspace.aiAssistComplimentary) {
    throw new HttpError(400, "Upgrade to a paid plan to add AI summaries");
  }

  await db.workspace.update({ where: { id: workspace.id }, data: { aiAssist: enabled } });
  return Response.json({ aiAssist: enabled });
});
