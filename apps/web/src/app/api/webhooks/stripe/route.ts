import type Stripe from "stripe";
import { db } from "@/lib/db";
import { ACTIVE_STATUSES, catalogOf, isAiItem, planOf } from "@/lib/billing";
import { stripe } from "@/lib/stripe";
import { applyBackupSetting } from "@/lib/retention";
import { enforceSeatLimits } from "@/lib/seatLimits";

async function syncSubscription(sub: Stripe.Subscription) {
  const workspaceId = sub.metadata.workspaceId;
  if (!workspaceId) return;
  const workspace = await db.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace) return;
  // An old subscription ending must not wipe out a newer one.
  if (workspace.stripeSubscriptionId && workspace.stripeSubscriptionId !== sub.id && !ACTIVE_STATUSES.has(sub.status)) return;

  const active = ACTIVE_STATUSES.has(sub.status);
  const planItem = sub.items.data.find((i) => planOf(i.price));
  const seatItem = sub.items.data.find((i) => catalogOf(i.price)?.item === "client_seat");
  const staffItem = sub.items.data.find((i) => catalogOf(i.price)?.item === "staff_seat");
  const cloudBackup = active && sub.items.data.some((i) => catalogOf(i.price)?.item === "cloud_backup");
  const paying = active && !!planItem;
  // AI summaries: paid for on the subscription, or given free by the founder (and still switched on).
  // Free AI ends when they start paying by card; from then on it's the paid add-on.
  const aiAssist = (active && sub.items.data.some((i) => isAiItem(catalogOf(i.price)?.item))) || (!paying && workspace.aiAssistComplimentary && workspace.aiAssist);
  await db.workspace.update({
    where: { id: workspaceId },
    data: {
      // A free plan we gave stays in place until they pay, and comes back if a subscription ends.
      plan: active && planItem ? planOf(planItem.price)! : (workspace.complimentaryPlan ?? "FREE"),
      ...(paying ? { complimentaryPlan: null, aiAssistComplimentary: false } : {}),
      stripeSubscriptionId: active ? sub.id : null,
      stripeCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
      subscriptionStatus: sub.status,
      extraClientSeats: active ? (seatItem?.quantity ?? 0) : 0,
      extraStaffSeats: active ? (staffItem?.quantity ?? 0) : 0,
      cloudBackup,
      aiAssist,
      currentPeriodEnd: active && planItem?.current_period_end ? new Date(planItem.current_period_end * 1000) : null,
    },
  });
  // Only a real change to cloud backup moves deletion dates; renewals and seat changes must not.
  if (workspace.cloudBackup !== cloudBackup) await applyBackupSetting(workspaceId, cloudBackup);
  // A plan that ended or lapsed pauses whoever it no longer covers; an upgrade restores them.
  await enforceSeatLimits(workspaceId);
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
      // Re-read so out-of-order deliveries always apply the latest state.
      await syncSubscription(await stripe().subscriptions.retrieve(event.data.object.id));
      break;
  }
  return new Response("ok");
}
