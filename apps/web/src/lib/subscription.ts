import type Stripe from "stripe";
import { db, type Workspace } from "@/lib/db";
import { tellOwnerBackupEnded } from "@/lib/backupEnded";
import { applyBackupSetting } from "@/lib/retention";
import { enforceSeatLimits } from "@/lib/seatLimits";
import { stripe } from "@/lib/stripe";

/** Stripe's "no such object": a test-mode id used with live keys, or something deleted in the Dashboard. */
export const isMissing = (err: unknown) => (err as { code?: string } | null)?.code === "resource_missing";

/**
 * Forgets a subscription that no longer exists in Stripe. Paid features end
 * the same way as when a subscription is cancelled: back to the complimentary
 * plan or Free, no add-ons, and anyone over the limits is paused.
 */
export async function forgetSubscription(workspace: Workspace, { customer = false } = {}) {
  console.log("[billing] forgetting a subscription Stripe doesn't have", JSON.stringify({ workspace: workspace.id, subscription: workspace.stripeSubscriptionId, customer }));
  await db.workspace.update({
    where: { id: workspace.id },
    data: {
      plan: workspace.complimentaryPlan ?? "FREE",
      stripeSubscriptionId: null,
      ...(customer ? { stripeCustomerId: null } : {}),
      subscriptionStatus: null,
      billingInterval: null,
      extraClientSeats: 0,
      extraStaffSeats: 0,
      cloudBackup: false,
      aiAssist: workspace.aiAssistComplimentary && workspace.aiAssist,
      currentPeriodEnd: null,
      cancelsAt: null,
    },
  });
  if (workspace.cloudBackup) {
    await applyBackupSetting(workspace.id, false);
    await tellOwnerBackupEnded(workspace.id);
  }
  await enforceSeatLimits(workspace.id);
}

/**
 * The workspace's subscription, or null when it has none. One that Stripe no
 * longer has (a sandbox id from before the switch to live keys) is forgotten,
 * so the owner can subscribe again instead of every billing page failing.
 */
export async function currentSubscription(workspace: Workspace, params?: Stripe.SubscriptionRetrieveParams): Promise<Stripe.Subscription | null> {
  if (!workspace.stripeSubscriptionId) return null;
  try {
    return await stripe().subscriptions.retrieve(workspace.stripeSubscriptionId, params);
  } catch (err) {
    if (!isMissing(err)) throw err;
    await forgetSubscription(workspace, { customer: !(await customerExists(workspace.stripeCustomerId)) });
    return null;
  }
}

async function customerExists(id: string | null) {
  if (!id) return false;
  try {
    return !(await stripe().customers.retrieve(id)).deleted;
  } catch (err) {
    if (isMissing(err)) return false;
    throw err;
  }
}

/**
 * The Stripe customer to bill, or null when there isn't a usable one. A
 * customer deleted in Stripe, or one from test mode, is forgotten so a new one
 * can be made.
 */
export async function currentCustomer(workspace: Workspace): Promise<string | null> {
  if (!workspace.stripeCustomerId) return null;
  if (await customerExists(workspace.stripeCustomerId)) return workspace.stripeCustomerId;
  console.log("[billing] forgetting a customer Stripe doesn't have", JSON.stringify({ workspace: workspace.id, customer: workspace.stripeCustomerId }));
  if (workspace.stripeSubscriptionId) await forgetSubscription(workspace, { customer: true });
  else await db.workspace.update({ where: { id: workspace.id }, data: { stripeCustomerId: null } });
  return null;
}
