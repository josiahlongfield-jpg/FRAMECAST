import { NextResponse, type NextRequest } from "next/server";
import { ACTIVITY_COOKIE as MARKER, activityCookie } from "@/lib/activity";

/**
 * Sign-ins last only as long as the browser is open, and end after a long
 * stretch of inactivity.
 *
 * The Auth.js session cookie lives for 30 days, so on its own a closed and
 * reopened browser lands straight back in the account. Alongside it we keep a
 * browser-session cookie (no expiry date, so the browser drops it on quit)
 * holding the time of the last request. It is set when a sign-in completes and
 * refreshed on every request. Any other request that finds a session without it,
 * or with an activity time older than IDLE_MS, is treated as signed out and the
 * session cookies are deleted. Encryption keys stay on the device, so
 * signing back in doesn't ask for the recovery key.
 */
/** Read by the sign-in page to explain why someone was signed out. */
const EXPIRED = "sf_signed_out";
const IDLE_MS = 8 * 3_600_000;
const SESSION_COOKIES = ["authjs.session-token", "__Secure-authjs.session-token"];

const sessionCookies = (req: NextRequest) =>
  req.cookies.getAll().filter((c) => SESSION_COOKIES.some((n) => c.name === n || c.name.startsWith(`${n}.`)));

function mark(res: NextResponse, req: NextRequest) {
  // No maxAge/expires: a browser-session cookie.
  res.cookies.set(MARKER, String(Date.now()), activityCookie(req.nextUrl.protocol === "https:"));
  return res;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Completing a sign-in (email link, Google, dev login) starts the browser session.
  if (pathname.startsWith("/api/auth/callback/")) return mark(NextResponse.next(), req);

  const session = sessionCookies(req);
  if (!session.length) return NextResponse.next();

  // API calls only keep the session alive, so an upload or reply already under
  // way is never cut off; the next page load does the check.
  if (pathname.startsWith("/api/")) return mark(NextResponse.next(), req);

  const last = Number(req.cookies.get(MARKER)?.value);
  const fresh = Number.isFinite(last) && last > 0 && Date.now() - last < IDLE_MS;
  if (fresh) return mark(NextResponse.next(), req);

  // The browser was closed, or nothing happened for too long: sign out here.
  // This request carries on as signed out (pages that need an account send
  // people to sign in as usual), and the response deletes the session cookies.
  const names = new Set(session.map((c) => c.name));
  const headers = new Headers(req.headers);
  const kept = req.cookies.getAll().filter((c) => !names.has(c.name) && c.name !== MARKER);
  if (kept.length) headers.set("cookie", kept.map((c) => `${c.name}=${c.value}`).join("; "));
  else headers.delete("cookie");
  const res = NextResponse.next({ request: { headers } });
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
