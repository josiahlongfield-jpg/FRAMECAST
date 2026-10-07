import { z } from "zod";
import { db } from "@/lib/db";
import { ACTIVE_STATUSES, catalogKey, intervalOf, priceId } from "@/lib/billing";
import { PLANS } from "@/lib/plans";
import { handle, HttpError, requireUser } from "@/lib/session";
import { stripe } from "@/lib/stripe";
import { limitByIp } from "@/lib/rateLimit";

const Body = z.object({ extraSeats: z.number().int().min(0).max(1000) });

/**
 * Set how many extra client seats the workspace buys on top of its plan.
 * Billed as a quantity on the workspace's existing Stripe subscription.
 */
export const POST = handle(async (req: Request) => {
  const { workspace } = await requireUser();
  const body = Body.safeParse(await req.json());
  await limitByIp("billing", 20, 600);
  if (!body.success) throw new HttpError(400, "Invalid seat count");
  if (!workspace.stripeSubscriptionId) throw new HttpError(400, "Upgrade to a paid plan to add client seats");

  const used = await db.client.count({ where: { workspaceId: workspace.id, removedAt: null } });
  if (PLANS[workspace.plan].clientSeats + body.data.extraSeats < used) {
    throw new HttpError(400, `You have ${used} clients. Remove some before lowering your seats.`);
  }

  const sub = await stripe().subscriptions.retrieve(workspace.stripeSubscriptionId);
  if (!ACTIVE_STATUSES.has(sub.status)) throw new HttpError(400, "Your subscription is not active");
  const price = await priceId(catalogKey("client_seat", intervalOf(sub)));
  const item = sub.items.data.find((i) => i.price.id === price);
  const items =
    body.data.extraSeats === 0
      ? item ? [{ id: item.id, deleted: true }] : []
      : item ? [{ id: item.id, quantity: body.data.extraSeats }] : [{ price, quantity: body.data.extraSeats }];
  if (items.length) await stripe().subscriptions.update(sub.id, { items, proration_behavior: "create_prorations" });
  // The webhook confirms; update now so the page reflects it immediately.
  await db.workspace.update({ where: { id: workspace.id }, data: { extraClientSeats: body.data.extraSeats } });
  return Response.json({ extraSeats: body.data.extraSeats });
});
