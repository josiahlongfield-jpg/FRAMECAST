import Stripe from "stripe";
import { HttpError } from "@/lib/session";

let client: Stripe | undefined;

export function stripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new HttpError(503, "Billing is not configured");
  // STRIPE_API_BASE points the client at a local fake for tests (e2e/fake-stripe.mjs).
  const base = process.env.STRIPE_API_BASE ? new URL(process.env.STRIPE_API_BASE) : null;
  client ??= new Stripe(
    process.env.STRIPE_SECRET_KEY,
    base ? { host: base.hostname, port: Number(base.port), protocol: base.protocol === "http:" ? "http" : "https" } : undefined,
  );
  return client;
}

export function appUrl(path = "") {
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return (process.env.APP_URL ?? (vercel ? `https://${vercel}` : "http://localhost:3000")) + path;
}
