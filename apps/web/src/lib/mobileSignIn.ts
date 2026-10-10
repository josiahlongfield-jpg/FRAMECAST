/**
 * Sign-in for the mobile app (/mobile/handoff and /api/mobile/exchange). The
 * apps haven't launched, so the live site keeps these switched off until
 * MOBILE_SIGNIN=on is set; local and preview builds keep them for testing.
 */
export const mobileSignInEnabled = () => process.env.VERCEL_ENV !== "production" || process.env.MOBILE_SIGNIN === "on";
