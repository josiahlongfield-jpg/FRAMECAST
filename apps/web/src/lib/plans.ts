import type { Plan } from "@prisma/client";

export type PlanLimits = {
  name: string;
  priceMonthly: number;
  /** Paying yearly gets two months free. */
  priceYearly: number;
  maxVideos: number | null;
  maxDurationMin: number;
  maxResolution: 720 | 1080 | 2160;
  /** Client accounts included. Clients watch and reply for free; more can be bought. */
  clientSeats: number;
  /** Staff who can sign in to the workspace, the owner included. */
  staffSeats: number;
  /** Clients see a short SureFrame intro before each video. Paid plans remove it. */
  showsPromo: boolean;
  features: string[];
};

export type Interval = "month" | "year";

/** Price of each extra client seat. */
export const EXTRA_SEAT_PRICE = 1.5;
export const EXTRA_SEAT_PRICE_YEARLY = 15;

/** Price of each extra staff member on Studio and Agency. */
export const EXTRA_STAFF_PRICE = 8;
export const EXTRA_STAFF_PRICE_YEARLY = 80;

/** Optional add-on: keep encrypted copies on our servers instead of the 30-day relay window. */
export const CLOUD_BACKUP_PRICE = 5;
export const CLOUD_BACKUP_PRICE_YEARLY = 50;

const paidFeatures = ["Unlimited videos", "Up to 4 hours per video", "1080p and 4K recording", "Custom branding", "No SureFrame intro before your videos", "Extra clients $1.50/month each", "Optional cloud backup"];

export const PLANS: Record<Plan, PlanLimits> = {
  FREE: {
    name: "Free",
    priceMonthly: 0,
    priceYearly: 0,
    maxVideos: 25,
    maxDurationMin: 5,
    maxResolution: 720,
    clientSeats: 3,
    staffSeats: 1,
    showsPromo: true,
    features: ["3 clients included", "25 videos", "Up to 5 minutes per video", "720p recording", "Video, voice and text replies", "End-to-end encrypted", "Clients see a short SureFrame intro before each video"],
  },
  SOLO: {
    name: "Solo",
    priceMonthly: 15,
    priceYearly: 150,
    maxVideos: null,
    maxDurationMin: 240,
    maxResolution: 2160,
    clientSeats: 10,
    staffSeats: 1,
    showsPromo: false,
    features: ["10 clients included", ...paidFeatures],
  },
  STUDIO: {
    name: "Studio",
    priceMonthly: 49,
    priceYearly: 490,
    maxVideos: null,
    maxDurationMin: 240,
    maxResolution: 2160,
    clientSeats: 40,
    staffSeats: 3,
    showsPromo: false,
    features: ["40 clients included", "3 staff logins", "Assign clients to staff", "Shared client list and inbox", "Extra staff $8/month each", "Everything in Solo"],
  },
  AGENCY: {
    name: "Agency",
    priceMonthly: 99,
    priceYearly: 990,
    maxVideos: null,
    maxDurationMin: 240,
    maxResolution: 2160,
    clientSeats: 100,
    staffSeats: 10,
    showsPromo: false,
    features: ["100 clients included", "10 staff logins", "Assign clients to staff", "Shared client list and inbox", "Extra staff $8/month each", "Everything in Solo"],
  },
};

export const PAID_PLANS = ["SOLO", "STUDIO", "AGENCY"] as const;
export type PaidPlan = (typeof PAID_PLANS)[number];

export function clientSeatLimit(w: { plan: Plan; extraClientSeats: number }) {
  return PLANS[w.plan].clientSeats + w.extraClientSeats;
}

/** Plans that can buy extra staff seats. */
export const TEAM_PLANS: Plan[] = ["STUDIO", "AGENCY"];

export function staffSeatLimit(w: { plan: Plan; extraStaffSeats: number }) {
  return PLANS[w.plan].staffSeats + (TEAM_PLANS.includes(w.plan) ? w.extraStaffSeats : 0);
}

/** Monthly cost of Solo with n clients, used to suggest Studio once it's cheaper. */
export function soloMonthlyCost(clients: number) {
  return PLANS.SOLO.priceMonthly + EXTRA_SEAT_PRICE * Math.max(0, clients - PLANS.SOLO.clientSeats);
}
