/**
 * Email sign-in links open a page with a Sign in button instead of the
 * one-time Auth.js callback itself. Mail providers and security scanners often
 * open links in an email before the person does, which used up the link and
 * left people with "expired or already used". Opening the page is harmless;
 * only the button press completes the sign-in.
 */
const CALLBACK = "/api/auth/callback/email?";

/** The address the sign-in email links to, for an Auth.js callback URL. */
export function confirmLink(callbackUrl: string) {
  const url = new URL(callbackUrl);
  return `${url.origin}/login/confirm?link=${encodeURIComponent(url.pathname + url.search)}`;
}

/** The callback path to sign in with, or null if the link isn't one of ours. */
export function callbackFrom(link: string | undefined) {
  return link && link.startsWith(CALLBACK) ? link : null;
}
