import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

const COOKIE_NAMES = ["__Secure-authjs.session-token", "authjs.session-token"];
const APP_SCHEME = process.env.MOBILE_APP_SCHEME ?? "sureframe";

/**
 * The mobile app opens this page in a system browser sheet. After the user
 * signs in with any web method, we hand the session token back to the app
 * through its URL scheme. The app then sends it as a cookie on API calls.
 */
export async function GET() {
  if (!(await auth())?.user) redirect("/login?next=/mobile/handoff");
  const jar = await cookies();
  const name = COOKIE_NAMES.find((n) => jar.get(n));
  if (!name) redirect("/login?next=/mobile/handoff");
  const params = new URLSearchParams({ cookie: name, token: jar.get(name)!.value });
  return Response.redirect(`${APP_SCHEME}://auth?${params}`, 302);
}
