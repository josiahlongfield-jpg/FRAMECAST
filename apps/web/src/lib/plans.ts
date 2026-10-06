import type { Plan } from "@prisma/client";

export type PlanLimits = {
  name: string;
  priceMonthly: number;
  maxVideos: number | null;
  maxDurationMin: number;
  maxResolution: 720 | 1080 | 2160;
  features: string[];
};

export const PLANS: Record<Plan, PlanLimits> = {
  FREE: {
    name: "Free",
    priceMonthly: 0,
    maxVideos: 25,
    maxDurationMin: 5,
    maxResolution: 720,
    features: ["25 videos", "Up to 5 minutes per video", "720p recording", "Video, voice and text replies"],
  },
  PRO: {
    name: "Pro",
    priceMonthly: 12,
    maxVideos: null,
    maxDurationMin: 240,
    maxResolution: 2160,
    features: ["Unlimited videos", "Up to 4 hours per video", "1080p and 4K recording", "Trim and edit", "Custom branding", "Download control"],
  },
  BUSINESS: {
    name: "Business",
    priceMonthly: 20,
    maxVideos: null,
    maxDurationMin: 240,
    maxResolution: 2160,
    features: ["Everything in Pro", "SSO (SAML / OIDC)", "Viewer analytics", "Retention policies", "Admin controls", "Priority support"],
  },
};

/** Stripe price ids come from env so the same build works in test and live mode. */
export function stripePriceFor(plan: Plan): string | undefined {
  if (plan === "PRO") return process.env.STRIPE_PRICE_PRO;
  if (plan === "BUSINESS") return process.env.STRIPE_PRICE_BUSINESS;
  return undefined;
}

export function planForStripePrice(priceId: string | undefined | null): Plan {
  if (priceId && priceId === process.env.STRIPE_PRICE_BUSINESS) return "BUSINESS";
  if (priceId && priceId === process.env.STRIPE_PRICE_PRO) return "PRO";
  return "FREE";
}
