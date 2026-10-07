import { z } from "zod";
import { db } from "@/lib/db";
import { ACTIVE_STATUSES, catalogKey, catalogOf, MANAGED_PAYMENTS, PLAN_ITEM, planOf, priceId } from "@/lib/billing";
import { PAID_PLANS, PLANS, staffSeatLimit, TEAM_PLANS } from "@/lib/plans";
import { handle, HttpError, requireRole, requireUser } from "@/lib/session";
import { appUrl, stripe } from "@/lib/stripe";
import { limitByIp } from "@/lib/rateLimit";

const Body = z.object({ plan: z.enum(PAID_PLANS), interval: z.enum(["month", "year"]).default("month") });

export const POST = handle(async (req: Request) => {
  const me = await requireUser();
  requireRole(me, "OWNER");
  const { user, workspace } = me;
  const body = Body.safeParse(await req.json());
  await limitByIp("billing", 20, 600);
  if (!body.success) throw new HttpError(400, "Invalid plan");
  const { plan, interval } = body.data;
  const price = await priceId(catalogKey(PLAN_ITEM[plan], interval));

  // Already subscribed: switch plans on the existing subscription instead of starting a second one.
  if (workspace.stripeSubscriptionId) {
    const sub = await stripe().subscriptions.retrieve(workspace.stripeSubscriptionId);
    if (ACTIVE_STATUSES.has(sub.status)) {
      const item = sub.items.data.find((i) => planOf(i.price));
      if (item?.price.id !== price) {
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
            .map(async (i) => {
              const entry = catalogOf(i.price);
              // Extra staff only exist on team plans.
              if (entry?.item === "staff_seat" && !TEAM_PLANS.includes(plan)) return { id: i.id, deleted: true as const };
              return entry && entry.interval !== interval ? { id: i.id, price: await priceId(catalogKey(entry.item, interval)) } : null;
            }),
        );
        await stripe().subscriptions.update(sub.id, {
          items: [item ? { id: item.id, price } : { price, quantity: 1 }, ...extras.filter((x) => x !== null)],
          proration_behavior: "create_prorations",
        });
        await db.workspace.update({ where: { id: workspace.id }, data: { plan } });
      }
      return Response.json({ url: appUrl("/settings/billing?upgraded=1") });
    }
  }

  let customer = workspace.stripeCustomerId;
  if (!customer) {
    const c = await stripe().customers.create({ email: user.email, name: workspace.name, metadata: { workspaceId: workspace.id } });
    customer = c.id;
    await db.workspace.update({ where: { id: workspace.id }, data: { stripeCustomerId: customer } });
  }

  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer,
    line_items: [{ price, quantity: 1 }],
    allow_promotion_codes: true,
    ...(MANAGED_PAYMENTS ? { managed_payments: { enabled: true } } : { automatic_tax: { enabled: true }, customer_update: { address: "auto", name: "auto" } }),
    client_reference_id: workspace.id,
    subscription_data: { metadata: { workspaceId: workspace.id } },
    success_url: appUrl("/settings/billing?upgraded=1"),
    cancel_url: appUrl("/pricing"),
  });
  return Response.json({ url: session.url });
});
