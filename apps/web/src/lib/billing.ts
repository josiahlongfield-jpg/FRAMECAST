import type Stripe from "stripe";
import type { Plan } from "@prisma/client";
import { CLOUD_BACKUP_PRICE, EXTRA_SEAT_PRICE, PLANS } from "@/lib/plans";
import { stripe } from "@/lib/stripe";

/**
 * Everything SureFrame sells, keyed by Stripe price lookup key. Products and
 * prices are created in Stripe on first use, so test and live mode need no
 * manual catalog setup and no price ids in env.
 */
export const CATALOG = {
  sureframe_pro_monthly: { product: "SureFrame Pro", amount: PLANS.PRO.priceMonthly },
  sureframe_business_monthly: { product: "SureFrame Business", amount: PLANS.BUSINESS.priceMonthly },
  sureframe_client_seat_monthly: { product: "SureFrame extra client seat", amount: EXTRA_SEAT_PRICE },
  sureframe_cloud_backup_monthly: { product: "SureFrame cloud backup", amount: CLOUD_BACKUP_PRICE },
} as const;

export type CatalogKey = keyof typeof CATALOG;

/** Software as a service, business use: eligible for Stripe Managed Payments. */
const TAX_CODE = "txcd_10103001";

export const PLAN_KEY: Record<Exclude<Plan, "FREE">, CatalogKey> = {
  PRO: "sureframe_pro_monthly",
  BUSINESS: "sureframe_business_monthly",
};
export const SEAT_KEY: CatalogKey = "sureframe_client_seat_monthly";
export const BACKUP_KEY: CatalogKey = "sureframe_cloud_backup_monthly";

const cache = new Map<CatalogKey, string>();

/** The Stripe price id for a catalog item, creating the product and price if missing. */
export async function priceId(key: CatalogKey): Promise<string> {
  const hit = cache.get(key);
  if (hit) return hit;
  if (!cache.size) {
    const found = await stripe().prices.list({ lookup_keys: Object.keys(CATALOG), active: true, limit: 100 });
    for (const p of found.data) if (p.lookup_key) cache.set(p.lookup_key as CatalogKey, p.id);
    const again = cache.get(key);
    if (again) return again;
  }
  const item = CATALOG[key];
  // Idempotency keys stop two cold servers from creating duplicates at the same moment.
  const product = await stripe().products.create(
    { name: item.product, tax_code: TAX_CODE, metadata: { lookup_key: key } },
    { idempotencyKey: `${key}-product-v1` },
  );
  const price = await stripe().prices.create(
    {
      product: product.id,
      currency: "usd",
      unit_amount: item.amount * 100,
      recurring: { interval: "month" },
      lookup_key: key,
      transfer_lookup_key: true,
    },
    { idempotencyKey: `${key}-price-v1` },
  );
  cache.set(key, price.id);
  return price.id;
}

/** Which catalog item a subscription item's price is, if any. */
export function catalogKeyOf(price: Pick<Stripe.Price, "lookup_key">): CatalogKey | null {
  const key = price.lookup_key;
  return key && key in CATALOG ? (key as CatalogKey) : null;
}

export function planOf(price: Pick<Stripe.Price, "lookup_key">): Plan | null {
  const key = catalogKeyOf(price);
  if (key === PLAN_KEY.PRO) return "PRO";
  if (key === PLAN_KEY.BUSINESS) return "BUSINESS";
  return null;
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
