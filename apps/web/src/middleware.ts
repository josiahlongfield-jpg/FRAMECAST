import { NextResponse, type NextRequest } from "next/server";
import { ACTIVITY_COOKIE as MARKER, activityCookie } from "@/lib/activity";

/**
 * Sign-ins last only as long as the browser is open, and end after a long
 * stretch of inactivity.
 *
 * The Auth.js session cookie lives for 30 days, so on its own a closed and
 * reopened browser lands straight back in the account. Alongside it we keep a
 * browser-session cookie (no expiry date, so the browser drops it on quit)
 * holding the time of the last request. It is set when a sign-in completes
 * (events.signIn in src/auth.ts) and refreshed on every request while it is
 * fresh. Any request, page or API, that finds a session without it, or with
 * an activity time older than IDLE_MS, is treated as signed out and the
 * session cookies are deleted. Encryption keys stay on the device, so signing
 * back in doesn't ask for the recovery key.
 */
/** Read by the sign-in page to explain why someone was signed out. */
const EXPIRED = "sf_signed_out";
const IDLE_MS = 8 * 3_600_000;
const SESSION_COOKIES = ["authjs.session-token", "__Secure-authjs.session-token"];
/** Sent by background checks (new replies, support answers), which aren't someone using the site. */
const BACKGROUND_HEADER = "x-sf-background";

const sessionCookies = (req: NextRequest) =>
  req.cookies.getAll().filter((c) => SESSION_COOKIES.some((n) => c.name === n || c.name.startsWith(`${n}.`)));

function mark(res: NextResponse, req: NextRequest) {
  // No maxAge/expires: a browser-session cookie.
  res.cookies.set(MARKER, String(Date.now()), activityCookie(req.nextUrl.protocol === "https:"));
  return res;
}

/** The request as it would arrive with no sign-in: the old session cookies are left off. */
function withoutSession(req: NextRequest, names: Set<string>) {
  const headers = new Headers(req.headers);
  const kept = req.cookies.getAll().filter((c) => !names.has(c.name) && c.name !== MARKER);
  if (kept.length) headers.set("cookie", kept.map((c) => `${c.name}=${c.value}`).join("; "));
  else headers.delete("cookie");
  return headers;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = sessionCookies(req);
  // Completing a sign-in from signed out (email link, Google, dev login) starts the browser session.
  if (!session.length) return pathname.startsWith("/api/auth/callback/") ? mark(NextResponse.next(), req) : NextResponse.next();

  const last = Number(req.cookies.get(MARKER)?.value);
  const fresh = Number.isFinite(last) && last > 0 && Date.now() - last < IDLE_MS;
  if (fresh) return req.headers.get(BACKGROUND_HEADER) ? NextResponse.next() : mark(NextResponse.next(), req);

  const names = new Set(session.map((c) => c.name));
  // Completing a new sign-in over an expired one: it goes ahead without the old session and sets
  // its own cookies and activity time (src/auth.ts). If the link was bad, the old cookies are
  // cleared on the next request.
  if (pathname.startsWith("/api/auth/callback/")) return NextResponse.next({ request: { headers: withoutSession(req, names) } });

  // The browser was closed, or nothing happened for too long: sign out here.
  // This request carries on as signed out (pages that need an account send
  // people to sign in as usual, API calls get "Sign in required"), and the
  // response deletes the session cookies.
  const res = NextResponse.next({ request: { headers: withoutSession(req, names) } });
  // __Secure- cookies can only be replaced by a Secure cookie.
  for (const name of names) res.cookies.set(name, "", { path: "/", maxAge: 0, secure: name.startsWith("__Secure-") });
  res.cookies.set(MARKER, "", { path: "/", maxAge: 0 });
  res.cookies.set(EXPIRED, "1", { path: "/", maxAge: 300, sameSite: "lax", httpOnly: true });
  return res;
}

export const config = {
  // Skip static files, the speech model and cron jobs.
  matcher: ["/((?!_next/|favicon|models/|api/cron/|.*\\.(?:png|jpg|jpeg|svg|ico|webp|txt|xml|webmanifest)$).*)"],
};
