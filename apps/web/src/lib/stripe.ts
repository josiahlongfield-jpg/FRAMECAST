import Stripe from "stripe";
import { HttpError } from "@/lib/session";

let client: Stripe | undefined;

export function stripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new HttpError(503, "Billing is not configured");
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY);
  return client;
}

export function appUrl(path = "") {
  return (process.env.APP_URL ?? "http://localhost:3000") + path;
}
