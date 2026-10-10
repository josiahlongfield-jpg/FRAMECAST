import type { Instrumentation } from "next";

/**
 * Settings the live site can't work properly without. A missing one fails
 * quietly elsewhere (no emails, no deletions, no billing updates), so each is
 * logged as an error at start-up where it can be seen.
 */
const REQUIRED: Record<string, string> = {
  AUTH_SECRET: "sign-in",
  APP_URL: "links in emails",
  RESEND_API_KEY: "all email, including sign-in links",
  MAIL_FROM: "all email, including sign-in links",
  CRON_SECRET: "reminders, expiry warnings and deleting expired recordings",
  STRIPE_SECRET_KEY: "billing",
  STRIPE_WEBHOOK_SECRET: "plans updating after payment",
  S3_BUCKET: "video storage",
  SUPPORT_EMAIL: "support hand-over and billing alerts",
  ANTHROPIC_API_KEY: "the help chat and AI summaries",
};

export function register() {
  if (process.env.VERCEL_ENV !== "production") return;
  for (const [name, what] of Object.entries(REQUIRED)) {
    if (!process.env[name]) console.error(JSON.stringify({ level: "error", message: `${name} isn't set, so ${what} won't work` }));
  }
  const days = process.env.RELAY_RETENTION_DAYS;
  if (days && !(Number.isInteger(Number(days)) && Number(days) > 0)) {
    console.error(JSON.stringify({ level: "error", message: `RELAY_RETENTION_DAYS "${days}" isn't a whole number of days; 30 is used` }));
  }
}

/** Every server error lands in Vercel's runtime logs as one searchable line with its route. */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const e = err as Error & { digest?: string };
  console.error(
    JSON.stringify({
      level: "error",
      message: e?.message,
      digest: e?.digest,
      stack: e?.stack?.split("\n").slice(0, 8).join("\n"),
      method: request.method,
      path: request.path,
      route: context.routePath,
      kind: context.routeType,
    }),
  );
};
