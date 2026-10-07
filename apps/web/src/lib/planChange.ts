import type Stripe from "stripe";
import type { Workspace } from "@prisma/client";
import { db } from "@/lib/db";
import { ACTIVE_STATUSES, catalogKey, catalogOf, PLAN_ITEM, planOf, priceId } from "@/lib/billing";
import { PLANS, staffSeatLimit, TEAM_PLANS, type Interval, type PaidPlan } from "@/lib/plans";
import { HttpError } from "@/lib/session";
import { stripe } from "@/lib/stripe";

export type PlanChange = {
  sub: Stripe.Subscription;
  items: Stripe.SubscriptionUpdateParams.Item[];
  /** True when the plan and interval are already the ones asked for. */
  same: boolean;
  /** Some items are removed (extra staff when leaving a team plan). */
  removesItems: boolean;
};

/**
 * How an existing subscription changes to another plan or interval, or null
 * when there is no active subscription (a new one goes through Checkout).
 * Throws when the workspace has more clients or staff than the plan allows.
 */
export async function planChange(workspace: Workspace, plan: PaidPlan, interval: Interval): Promise<PlanChange | null> {
  if (!workspace.stripeSubscriptionId) return null;
  const sub = await stripe().subscriptions.retrieve(workspace.stripeSubscriptionId, { expand: ["default_payment_method"] });
  if (!ACTIVE_STATUSES.has(sub.status)) return null;
  const price = await priceId(catalogKey(PLAN_ITEM[plan], interval));
  const item = sub.items.data.find((i) => planOf(i.price));
  if (item?.price.id === price) return { sub, items: [], same: true, removesItems: false };

  const used = await db.client.count({ where: { workspaceId: workspace.id, removedAt: null } });
  if (PLANS[plan].clientSeats + workspace.extraClientSeats < used) {
    throw new HttpError(400, `You have ${used} clients, more than ${PLANS[plan].name} allows. Remove some or add seats first.`);
  }
  const staff = await db.membership.count({ where: { workspaceId: workspace.id } });
  if (staffSeatLimit({ plan, extraStaffSeats: workspace.extraStaffSeats }) < staff) {
    throw new HttpError(400, `You have ${staff} people on your team, more than ${PLANS[plan].name} allows. Remove some first.`);
  }
  // Every item on a subscription bills on the same interval, so extras move with the plan.
  const extras = await Promise.all(
    sub.items.data
      .filter((i) => i !== item)
      .map(async (i): Promise<Stripe.SubscriptionUpdateParams.Item | null> => {
        const entry = catalogOf(i.price);
        // Extra staff only exist on team plans.
        if (entry?.item === "staff_seat" && !TEAM_PLANS.includes(plan)) return { id: i.id, deleted: true };
        return entry && entry.interval !== interval ? { id: i.id, price: await priceId(catalogKey(entry.item, interval)) } : null;
      }),
  );
  const items = [item ? { id: item.id, price } : { price, quantity: 1 }, ...extras.filter((x) => x !== null)];
  return { sub, items, same: false, removesItems: items.some((i) => i.deleted) };
}

/** The card (or other method) the subscription is charged to, for showing to the owner. */
export async function paymentMethodLabel(sub: Stripe.Subscription): Promise<string | null> {
  let pm = sub.default_payment_method;
  if (!pm || typeof pm === "string") {
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    const customer = await stripe().customers.retrieve(customerId, { expand: ["invoice_settings.default_payment_method"] });
    pm = customer.deleted ? null : customer.invoice_settings?.default_payment_method ?? null;
  }
  if (!pm || typeof pm === "string") return null;
  if (pm.card) return `${pm.card.brand.charAt(0).toUpperCase()}${pm.card.brand.slice(1)} ending ${pm.card.last4}`;
  if (pm.type === "link") return "your Link account";
  return pm.type.replace(/_/g, " ");
}
