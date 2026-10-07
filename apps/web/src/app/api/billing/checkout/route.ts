import { z } from "zod";
import { db } from "@/lib/db";
import { catalogKey, MANAGED_PAYMENTS, PLAN_ITEM, priceId } from "@/lib/billing";
import { PAID_PLANS } from "@/lib/plans";
import { planChange } from "@/lib/planChange";
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
  // It's paid for now, and an upgrade only applies once that payment succeeds.
  const change = await planChange(workspace, plan, interval);
  if (change) {
    if (change.same) return Response.json({ url: appUrl("/settings/billing") });
    const updated = await stripe().subscriptions.update(change.sub.id, {
      items: change.items,
      // The new plan starts today at its full price, less a credit for the unused part of the old one.
      billing_cycle_anchor: { type: "now" },
      proration_behavior: "always_invoice",
      // Pending updates can't remove items; those changes are downgrades with nothing to pay.
      ...(change.removesItems ? {} : { payment_behavior: "pending_if_incomplete" as const }),
      expand: ["latest_invoice"],
    });
    if (updated.pending_update) {
      // The card was declined or needs confirming: pay on Stripe's invoice page, then the change applies.
      const invoice = updated.latest_invoice;
      const pay = invoice && typeof invoice !== "string" ? invoice.hosted_invoice_url : null;
      if (pay) return Response.json({ url: pay });
      throw new HttpError(402, "Your payment didn't go through. Update your card and try again.");
    }
    await db.workspace.update({ where: { id: workspace.id }, data: { plan } });
    return Response.json({ url: appUrl("/settings/billing?upgraded=1") });
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
