import { z } from "zod";
import { db } from "@/lib/db";
import { ACTIVE_STATUSES, MANAGED_PAYMENTS, PLAN_KEY, planOf, priceId } from "@/lib/billing";
import { PLANS } from "@/lib/plans";
import { handle, HttpError, requireUser } from "@/lib/session";
import { appUrl, stripe } from "@/lib/stripe";
import { limitByIp } from "@/lib/rateLimit";

const Body = z.object({ plan: z.enum(["PRO", "BUSINESS"]) });

export const POST = handle(async (req: Request) => {
  const { user, workspace } = await requireUser();
  const body = Body.safeParse(await req.json());
  await limitByIp("billing", 20, 600);
  if (!body.success) throw new HttpError(400, "Invalid plan");
  const price = await priceId(PLAN_KEY[body.data.plan]);

  // Already subscribed: switch plans on the existing subscription instead of starting a second one.
  if (workspace.stripeSubscriptionId) {
    const sub = await stripe().subscriptions.retrieve(workspace.stripeSubscriptionId);
    if (ACTIVE_STATUSES.has(sub.status)) {
      const item = sub.items.data.find((i) => planOf(i.price));
      if (item?.price.id !== price) {
        const used = await db.client.count({ where: { workspaceId: workspace.id, removedAt: null } });
        if (PLANS[body.data.plan].clientSeats + workspace.extraClientSeats < used) {
          throw new HttpError(400, `You have ${used} clients, more than ${PLANS[body.data.plan].name} allows. Remove some or add seats first.`);
        }
        await stripe().subscriptions.update(sub.id, {
          items: item ? [{ id: item.id, price }] : [{ price, quantity: 1 }],
          proration_behavior: "create_prorations",
        });
        await db.workspace.update({ where: { id: workspace.id }, data: { plan: body.data.plan } });
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
