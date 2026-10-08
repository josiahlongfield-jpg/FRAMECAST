/**
 * The browser-session cookie holding the time of the last request; see
 * src/middleware.ts. No expiry date, so the browser drops it on quit.
 */
export const ACTIVITY_COOKIE = "sf_active";

export const activityCookie = (secure = process.env.NODE_ENV === "production") => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure,
  path: "/",
});
