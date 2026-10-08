import { z } from "zod";
import { db } from "@/lib/db";
import { ACTIVE_STATUSES, AI_ITEM, catalogKey, catalogOf, intervalOf, isAiItem, planOf, priceId } from "@/lib/billing";
import { handle, HttpError, requireRole, requireUser } from "@/lib/session";
import { stripe } from "@/lib/stripe";
import { limitByIp } from "@/lib/rateLimit";
import type { PaidPlan } from "@/lib/plans";

const Body = z.object({ enabled: z.boolean() });

/**
 * Optional paid add-on: AI transcripts and summaries. The owner or an admin
 * switches it on; it's added to the subscription at the plan's add-on price,
 * or switched on free when the founder has given it with a complimentary plan.
 */
export const POST = handle(async (req: Request) => {
  const me = await requireUser();
  requireRole(me, "OWNER", "ADMIN");
  const { workspace } = me;
  const body = Body.safeParse(await req.json());
  await limitByIp("billing", 20, 600);
  if (!body.success) throw new HttpError(400, "Invalid request");
  const enabled = body.data.enabled;

  if (enabled && workspace.plan === "FREE") throw new HttpError(400, "AI summaries are available on paid plans");

  if (workspace.stripeSubscriptionId) {
    const sub = await stripe().subscriptions.retrieve(workspace.stripeSubscriptionId);
    const active = ACTIVE_STATUSES.has(sub.status);
    const existing = sub.items.data.filter((i) => isAiItem(catalogOf(i.price)?.item));
    if (enabled && !workspace.aiAssistComplimentary) {
      if (!active) throw new HttpError(400, "Your subscription is not active");
      const plan = sub.items.data.map((i) => planOf(i.price)).find(Boolean) as PaidPlan | undefined;
      if (!plan) throw new HttpError(400, "AI summaries are available on paid plans");
      const price = await priceId(catalogKey(AI_ITEM[plan], intervalOf(sub)));
      if (!existing.some((i) => i.price.id === price)) {
        await stripe().subscriptions.update(sub.id, {
          items: [{ price, quantity: 1 }, ...existing.map((i) => ({ id: i.id, deleted: true }))],
        });
      }
    }
    if (!enabled && existing.length && active) {
      await stripe().subscriptions.update(sub.id, { items: existing.map((i) => ({ id: i.id, deleted: true })) });
    }
  } else if (enabled && !workspace.aiAssistComplimentary) {
    throw new HttpError(400, "Upgrade to a paid plan to add AI summaries");
  }

  await db.workspace.update({ where: { id: workspace.id }, data: { aiAssist: enabled } });
  return Response.json({ aiAssist: enabled });
});
