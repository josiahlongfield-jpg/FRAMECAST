import type Stripe from "stripe";
import type { Plan } from "@prisma/client";
import {
  CLOUD_BACKUP_PRICE,
  CLOUD_BACKUP_PRICE_YEARLY,
  EXTRA_SEAT_PRICE,
  EXTRA_SEAT_PRICE_YEARLY,
  PLANS,
  type Interval,
  type PaidPlan,
} from "@/lib/plans";
import { stripe } from "@/lib/stripe";

/** What SureFrame sells. Each item has a monthly and a yearly price. */
const ITEMS = {
  solo: { product: "SureFrame Solo", month: PLANS.SOLO.priceMonthly, year: PLANS.SOLO.priceYearly },
  studio: { product: "SureFrame Studio", month: PLANS.STUDIO.priceMonthly, year: PLANS.STUDIO.priceYearly },
  agency: { product: "SureFrame Agency", month: PLANS.AGENCY.priceMonthly, year: PLANS.AGENCY.priceYearly },
  client_seat: { product: "SureFrame extra client", month: EXTRA_SEAT_PRICE, year: EXTRA_SEAT_PRICE_YEARLY },
  cloud_backup: { product: "SureFrame cloud backup", month: CLOUD_BACKUP_PRICE, year: CLOUD_BACKUP_PRICE_YEARLY },
} as const;

export type CatalogItem = keyof typeof ITEMS;
const SUFFIX: Record<Interval, string> = { month: "monthly", year: "yearly" };

/** Stripe price lookup key, e.g. sureframe_solo_yearly. */
export type CatalogKey = `sureframe_${CatalogItem}_${"monthly" | "yearly"}`;
export const catalogKey = (item: CatalogItem, interval: Interval) => `sureframe_${item}_${SUFFIX[interval]}` as CatalogKey;

/**
 * Everything SureFrame sells, keyed by Stripe price lookup key. Products and
 * prices are created in Stripe on first use, so test and live mode need no
 * manual catalog setup and no price ids in env.
 */
export const CATALOG = Object.fromEntries(
  (Object.keys(ITEMS) as CatalogItem[]).flatMap((item) =>
    (["month", "year"] as const).map((interval) => [catalogKey(item, interval), { item, interval, product: ITEMS[item].product, amount: ITEMS[item][interval] }]),
  ),
) as Record<CatalogKey, { item: CatalogItem; interval: Interval; product: string; amount: number }>;

/** Software as a service, business use: eligible for Stripe Managed Payments. */
const TAX_CODE = "txcd_10103001";

export const PLAN_ITEM: Record<PaidPlan, CatalogItem> = { SOLO: "solo", STUDIO: "studio", AGENCY: "agency" };

const cache = new Map<CatalogKey, string>();
const products = new Map<CatalogItem, string>();

/** The Stripe price id for a catalog item, creating the product and price if missing. */
export async function priceId(key: CatalogKey): Promise<string> {
  const hit = cache.get(key);
  if (hit) return hit;
  if (!cache.size) {
    // Stripe accepts at most 10 lookup keys per list call.
    const keys = Object.keys(CATALOG);
    for (let i = 0; i < keys.length; i += 10) {
      const found = await stripe().prices.list({ lookup_keys: keys.slice(i, i + 10), active: true, limit: 100 });
      for (const p of found.data) {
        if (!p.lookup_key || !(p.lookup_key in CATALOG)) continue;
        cache.set(p.lookup_key as CatalogKey, p.id);
        products.set(CATALOG[p.lookup_key as CatalogKey].item, typeof p.product === "string" ? p.product : p.product.id);
      }
    }
    const again = cache.get(key);
    if (again) return again;
  }
  const entry = CATALOG[key];
  // Idempotency keys stop two cold servers from creating duplicates at the same moment.
  let product = products.get(entry.item);
  if (!product) {
    product = (
      await stripe().products.create(
        { name: entry.product, tax_code: TAX_CODE, metadata: { item: entry.item } },
        { idempotencyKey: `sureframe_${entry.item}-product-v2` },
      )
    ).id;
    products.set(entry.item, product);
  }
  const price = await stripe().prices.create(
    {
      product,
      currency: "usd",
      unit_amount: Math.round(entry.amount * 100),
      recurring: { interval: entry.interval },
      lookup_key: key,
      transfer_lookup_key: true,
    },
    { idempotencyKey: `${key}-price-v2` },
  );
  cache.set(key, price.id);
  return price.id;
}

/** Which catalog entry a subscription item's price is, if any. */
export function catalogOf(price: Pick<Stripe.Price, "lookup_key">) {
  const key = price.lookup_key;
  return key && key in CATALOG ? CATALOG[key as CatalogKey] : null;
}

export function planOf(price: Pick<Stripe.Price, "lookup_key">): Plan | null {
  const item = catalogOf(price)?.item;
  const plan = (Object.keys(PLAN_ITEM) as PaidPlan[]).find((p) => PLAN_ITEM[p] === item);
  return plan ?? null;
}

/** The billing interval of a subscription, read from its plan item. */
export function intervalOf(sub: Stripe.Subscription): Interval {
  const plan = sub.items.data.find((i) => planOf(i.price));
  return (plan && catalogOf(plan.price)?.interval) || "month";
}

/** Stripe's merchant-of-record mode. On unless explicitly turned off. */
export const MANAGED_PAYMENTS = process.env.STRIPE_MANAGED_PAYMENTS !== "off";

export const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

let portalConfig: string | undefined;

/** A customer-portal configuration so cancelling and card updates work without dashboard setup. */
export async function portalConfiguration(): Promise<string> {
  if (portalConfig) return portalConfig;
  const existing = await stripe().billingPortal.configurations.list({ active: true, limit: 100 });
  const ours = existing.data.find((c) => c.metadata?.app === "sureframe");
  if (ours) return (portalConfig = ours.id);
  const created = await stripe().billingPortal.configurations.create(
    {
      business_profile: { headline: "Manage your SureFrame subscription" },
      features: {
        invoice_history: { enabled: true },
        payment_method_update: { enabled: true },
        subscription_cancel: { enabled: true, mode: "at_period_end" },
      },
      metadata: { app: "sureframe" },
    },
    { idempotencyKey: "sureframe-portal-v1" },
  );
  return (portalConfig = created.id);
}
