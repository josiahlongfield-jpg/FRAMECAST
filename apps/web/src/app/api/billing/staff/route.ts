import { z } from "zod";
import { db } from "@/lib/db";
import { enforceSeatLimits } from "@/lib/seatLimits";
import { ACTIVE_STATUSES, catalogKey, intervalOf, priceId } from "@/lib/billing";
import { PLANS, TEAM_PLANS } from "@/lib/plans";
import { handle, HttpError, requireRole, requireUser } from "@/lib/session";
import { stripe } from "@/lib/stripe";
import { limitByIp } from "@/lib/rateLimit";

const Body = z.object({ extraStaff: z.number().int().min(0).max(500) });

/**
 * Set how many extra staff logins a Studio or Agency workspace buys on top of
 * its plan. Billed as a quantity on the existing Stripe subscription.
 */
export const POST = handle(async (req: Request) => {
  const me = await requireUser();
  requireRole(me, "OWNER");
  const { workspace } = me;
  const body = Body.safeParse(await req.json());
  await limitByIp("billing", 20, 600);
  if (!body.success) throw new HttpError(400, "Invalid staff count");
  if (!TEAM_PLANS.includes(workspace.plan) || !workspace.stripeSubscriptionId) throw new HttpError(400, "Extra staff are available on Studio and Agency");

  const used = await db.membership.count({ where: { workspaceId: workspace.id } });
  if (PLANS[workspace.plan].staffSeats + body.data.extraStaff < used) {
    throw new HttpError(400, `You have ${used} people on your team. Remove some before lowering your staff seats.`);
  }

  const sub = await stripe().subscriptions.retrieve(workspace.stripeSubscriptionId);
  if (!ACTIVE_STATUSES.has(sub.status)) throw new HttpError(400, "Your subscription is not active");
  const price = await priceId(catalogKey("staff_seat", intervalOf(sub)));
  const item = sub.items.data.find((i) => i.price.id === price);
  const items =
    body.data.extraStaff === 0
      ? item ? [{ id: item.id, deleted: true }] : []
      : item ? [{ id: item.id, quantity: body.data.extraStaff }] : [{ price, quantity: body.data.extraStaff }];
  if (items.length) await stripe().subscriptions.update(sub.id, { items, proration_behavior: "create_prorations" });
  // The webhook confirms; update now so the page reflects it immediately.
  await db.workspace.update({ where: { id: workspace.id }, data: { extraStaffSeats: body.data.extraStaff } });
  await enforceSeatLimits(workspace.id);
  return Response.json({ extraStaff: body.data.extraStaff });
});
