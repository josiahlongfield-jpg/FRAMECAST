import type Stripe from "stripe";
import { db } from "@/lib/db";
import { planForStripePrice } from "@/lib/plans";
import { stripe } from "@/lib/stripe";

const ACTIVE = new Set(["active", "trialing", "past_due"]);

async function syncSubscription(sub: Stripe.Subscription) {
  const workspaceId = sub.metadata.workspaceId;
  if (!workspaceId) return;
  const item = sub.items.data[0];
  const plan = ACTIVE.has(sub.status) ? planForStripePrice(item?.price.id) : "FREE";
  await db.workspace.update({
    where: { id: workspaceId },
    data: {
      plan,
      stripeSubscriptionId: sub.id,
      subscriptionStatus: sub.status,
      currentPeriodEnd: item?.current_period_end ? new Date(item.current_period_end * 1000) : null,
    },
  });
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new Response("Webhook not configured", { status: 503 });
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, req.headers.get("stripe-signature") ?? "", secret);
  } catch {
    return new Response("Bad signature", { status: 400 });
  }

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await syncSubscription(event.data.object);
      break;
  }
  return new Response("ok");
}
