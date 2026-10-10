import type Stripe from "stripe";
import { db } from "@/lib/db";
import { ACTIVE_STATUSES, catalogOf, isAiItem, loadCatalog, planOf } from "@/lib/billing";
import { stripe } from "@/lib/stripe";
import { tellOwnerBackupEnded } from "@/lib/backupEnded";
import { applyBackupSetting } from "@/lib/retention";
import { enforceSeatLimits } from "@/lib/seatLimits";
import { alertFounder } from "@/lib/founderAlert";
import { rateLimit } from "@/lib/rateLimit";
import { forgetSubscription, isMissing } from "@/lib/subscription";

const money = (cents: number, currency: string) => `${currency.toUpperCase()} ${(cents / 100).toFixed(2)}`;

/** One email per subject a day, however many times Stripe sends the event. */
const once = (key: string) => rateLimit(`alert:${key}`, 1, 86400).then(() => true, () => false);

/** When a cancelled subscription ends, or null if it renews. */
function cancelDate(sub: Stripe.Subscription, planItem?: Stripe.SubscriptionItem) {
  if (sub.cancel_at) return new Date(sub.cancel_at * 1000);
  if (sub.cancel_at_period_end && planItem?.current_period_end) return new Date(planItem.current_period_end * 1000);
  return null;
}

async function syncSubscription(sub: Stripe.Subscription) {
  const workspaceId = sub.metadata.workspaceId;
  if (!workspaceId) return;
  const workspace = await db.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace) return;
  await loadCatalog();
  // An old subscription ending must not wipe out a newer one.
  if (workspace.stripeSubscriptionId && workspace.stripeSubscriptionId !== sub.id && !ACTIVE_STATUSES.has(sub.status)) return;
  if (workspace.stripeSubscriptionId && workspace.stripeSubscriptionId !== sub.id) {
    // A second paid subscription for the same workspace: keep following the first, and get a person to refund one.
    const first = await stripe().subscriptions.retrieve(workspace.stripeSubscriptionId).catch((err) => (isMissing(err) ? null : Promise.reject(err)));
    if (first && ACTIVE_STATUSES.has(first.status)) {
      if (await once(`two-subs:${sub.id}`)) {
        await alertFounder(`${workspace.name} has two subscriptions`, [
          `Workspace ${workspace.name} (${workspace.id}) is paying for two subscriptions at once: ${first.id} (the one SureFrame uses) and ${sub.id}.`,
          "Cancel and refund the extra one in the Stripe Dashboard, under Customers.",
        ]);
      }
      return;
    }
  }

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
      // A free plan we gave stays in place until they start paying; paying replaces it for good.
      plan: active && planItem ? planOf(planItem.price)! : (workspace.complimentaryPlan ?? "FREE"),
      ...(paying ? { complimentaryPlan: null, aiAssistComplimentary: false } : {}),
      stripeSubscriptionId: active ? sub.id : null,
      // Not from an ended one: its customer may have been deleted (customer.deleted clears it).
      ...(active ? { stripeCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id } : {}),
      subscriptionStatus: sub.status,
      billingInterval: paying ? (catalogOf(planItem.price)?.interval ?? null) : null,
      extraClientSeats: active ? (seatItem?.quantity ?? 0) : 0,
      extraStaffSeats: active ? (staffItem?.quantity ?? 0) : 0,
      cloudBackup,
      aiAssist,
      currentPeriodEnd: active && planItem?.current_period_end ? new Date(planItem.current_period_end * 1000) : null,
      cancelsAt: active ? cancelDate(sub, planItem) : null,
    },
  });
  // Only a real change to cloud backup moves deletion dates; renewals and seat changes must not.
  if (workspace.cloudBackup !== cloudBackup) {
    await applyBackupSetting(workspaceId, cloudBackup);
    // The owner switching it off updates the workspace first, so this is the plan ending or lapsing.
    if (!cloudBackup) await tellOwnerBackupEnded(workspaceId);
  }
  // A plan that ended or lapsed pauses whoever it no longer covers; an upgrade restores them.
  await enforceSeatLimits(workspaceId);
}

/** A customer deleted in the Stripe Dashboard: forget it, so a new one is made if they subscribe again. */
async function customerDeleted(customerId: string) {
  const workspace = await db.workspace.findUnique({ where: { stripeCustomerId: customerId } });
  if (!workspace) return;
  if (workspace.stripeSubscriptionId) await forgetSubscription(workspace, { customer: true });
  else await db.workspace.update({ where: { id: workspace.id }, data: { stripeCustomerId: null } });
}

const workspaceForCustomer = (customer: string | Stripe.Customer | Stripe.DeletedCustomer | null) =>
  customer ? db.workspace.findUnique({ where: { stripeCustomerId: typeof customer === "string" ? customer : customer.id } }) : null;

/**
 * Stripe (or Link support) refunded a payment. Access isn't changed
 * automatically: a person decides whether the subscription should end too.
 */
async function refunded(charge: Stripe.Charge) {
  const workspace = await workspaceForCustomer(charge.customer);
  if (!(await once(`refund:${charge.id}:${charge.amount_refunded}`))) return;
  await alertFounder(`Refund for ${workspace?.name ?? "a customer"}`, [
    `${money(charge.amount_refunded, charge.currency)} of a ${money(charge.amount, charge.currency)} payment was refunded${charge.refunded ? " (all of it)" : ""}.`,
    workspace ? `Workspace: ${workspace.name} (${workspace.id}), plan ${workspace.plan}.` : `Stripe customer: ${String(charge.customer ?? "unknown")}.`,
    "Their subscription carries on. If the refund means it should end, cancel it in the Stripe Dashboard under Customers.",
  ]);
}

/**
 * A customer disputed a payment. Their subscription stops renewing (more
 * charges would only bring more disputes) but nothing is taken away before the
 * period they paid for ends, as Terms section 10 says; a person decides the rest.
 */
async function disputed(dispute: Stripe.Dispute) {
  const charge = typeof dispute.charge === "string" ? await stripe().charges.retrieve(dispute.charge) : dispute.charge;
  const workspace = await workspaceForCustomer(charge.customer);
  let stopped = false;
  if (workspace?.stripeSubscriptionId) {
    stopped = await stripe()
      .subscriptions.update(workspace.stripeSubscriptionId, { cancel_at_period_end: true })
      .then(() => true, (err) => (console.log("[billing] stopping renewal after dispute failed", String(err)), false));
  }
  if (!(await once(`dispute:${dispute.id}`))) return;
  await alertFounder(`Payment disputed by ${workspace?.name ?? "a customer"}`, [
    `A ${money(dispute.amount, dispute.currency)} payment was disputed (reason: ${dispute.reason}).`,
    workspace
      ? `Workspace: ${workspace.name} (${workspace.id}). ${stopped ? "Their subscription won't renew, so they aren't charged again; it stays active until the period they paid for ends. To keep it going, turn renewal back on in the Stripe Dashboard." : "Their subscription couldn't be stopped from renewing; do it in the Stripe Dashboard."}`
      : `Stripe customer: ${String(charge.customer ?? "unknown")}.`,
    "Stripe handles the dispute itself; check it in the Stripe Dashboard under Disputes.",
  ]);
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
    case "customer.deleted":
      await customerDeleted(event.data.object.id);
      break;
    case "charge.refunded":
      await refunded(event.data.object);
      break;
    case "charge.dispute.created":
      await disputed(event.data.object);
      break;
  }
  return new Response("ok");
}
