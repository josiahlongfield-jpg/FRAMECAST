import type Stripe from "stripe";
import { ACTIVE_STATUSES, catalogOf, intervalOf, isAiItem, loadCatalog, planOf } from "@/lib/billing";
import { db, type Workspace } from "@/lib/db";
import { tellOwnerBackupEnded } from "@/lib/backupEnded";
import { alertFounder } from "@/lib/founderAlert";
import { rateLimit } from "@/lib/rateLimit";
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
export async function forgetSubscription(workspace: Workspace, { customer = false, notify = true } = {}) {
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
    if (notify) await tellOwnerBackupEnded(workspace.id);
  }
  await enforceSeatLimits(workspace.id, { notify });
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

export async function customerExists(id: string | null) {
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

/** One email per subject a day, however many times Stripe sends the event. */
const once = (key: string) => rateLimit(`alert:${key}`, 1, 86400).then(() => true, () => false);

/** When a cancelled subscription ends, or null if it renews. */
function cancelDate(sub: Stripe.Subscription, planItem?: Stripe.SubscriptionItem) {
  if (sub.cancel_at) return new Date(sub.cancel_at * 1000);
  if (sub.cancel_at_period_end && planItem?.current_period_end) return new Date(planItem.current_period_end * 1000);
  return null;
}

/**
 * Brings a workspace's plan, seats and add-ons in line with its Stripe
 * subscription (the webhook, and support's "Re-sync billing"). `notify: false`
 * skips the owner's emails about paused clients or ended cloud backup.
 */
export async function syncSubscription(sub: Stripe.Subscription, { notify = true } = {}) {
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
    if (!cloudBackup && notify) await tellOwnerBackupEnded(workspaceId);
  }
  // A plan that ended or lapsed pauses whoever it no longer covers; an upgrade restores them.
  await enforceSeatLimits(workspaceId, { notify });
}

/**
 * Daily: subscriptions nobody has opened Billing for are checked too, so one
 * Stripe no longer has (from test mode, or deleted there) stops giving paid
 * features, and workspaces from before the billing interval was stored get it.
 * Visited in a random order within a time budget, so a long list is covered
 * over a few days.
 */
export async function reconcileSubscriptions(budgetMs = 120_000) {
  if (!process.env.STRIPE_SECRET_KEY) return { checked: 0, forgotten: 0 };
  const deadline = Date.now() + budgetMs;
  const ids = (await db.workspace.findMany({ where: { stripeSubscriptionId: { not: null } }, select: { id: true } })).map((w) => w.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  let checked = 0;
  let forgotten = 0;
  for (const id of ids) {
    if (Date.now() > deadline) break;
    const w = await db.workspace.findUnique({ where: { id } });
    if (!w?.stripeSubscriptionId) continue;
    try {
      const sub = await currentSubscription(w);
      checked++;
      if (!sub) forgotten++;
      else if (w.billingInterval !== intervalOf(sub)) await db.workspace.update({ where: { id }, data: { billingInterval: intervalOf(sub) } });
    } catch (err) {
      console.error(JSON.stringify({ level: "error", message: "[billing] subscription check failed", workspace: id, error: String(err) }));
      // Stripe can't be reached: try again tomorrow rather than failing every one.
      if ((err as { type?: string })?.type === "StripeConnectionError") break;
    }
  }
  console.log("[billing] subscriptions checked", JSON.stringify({ checked, forgotten, total: ids.length }));
  return { checked, forgotten };
}
