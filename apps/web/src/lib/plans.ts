import type { Plan } from "@prisma/client";

export type PlanLimits = {
  name: string;
  priceMonthly: number;
  maxVideos: number | null;
  maxDurationMin: number;
  maxResolution: 720 | 1080 | 2160;
  /** Client accounts included. Clients watch and reply for free; more can be bought. */
  clientSeats: number;
  features: string[];
};

export const PLANS: Record<Plan, PlanLimits> = {
  FREE: {
    name: "Free",
    priceMonthly: 0,
    maxVideos: 25,
    maxDurationMin: 5,
    maxResolution: 720,
    clientSeats: 3,
    features: ["25 videos", "Up to 5 minutes per video", "720p recording", "3 client accounts", "Video, voice and text replies", "End-to-end encrypted"],
  },
  PRO: {
    name: "Pro",
    priceMonthly: 12,
    maxVideos: null,
    maxDurationMin: 240,
    maxResolution: 2160,
    clientSeats: 10,
    features: ["Unlimited videos", "10 client accounts included", "Up to 4 hours per video", "1080p and 4K recording", "Trim and edit", "Custom branding", "Download control"],
  },
  BUSINESS: {
    name: "Business",
    priceMonthly: 20,
    maxVideos: null,
    maxDurationMin: 240,
    maxResolution: 2160,
    clientSeats: 25,
    features: ["Everything in Pro", "25 client accounts included", "SSO (SAML / OIDC)", "Viewer analytics", "Retention policies", "Admin controls", "Priority support"],
  },
};

/** Optional add-on: keep encrypted copies on our servers instead of the 30-day relay window. */
export const CLOUD_BACKUP_PRICE = 5;

/** Price of each extra client seat, per month. */
export const EXTRA_SEAT_PRICE = 2;

export function clientSeatLimit(w: { plan: Plan; extraClientSeats: number }) {
  return PLANS[w.plan].clientSeats + w.extraClientSeats;
}
