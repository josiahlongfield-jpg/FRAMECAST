import crypto from "node:crypto";
import { z } from "zod";
import { encode } from "next-auth/jwt";
import { db } from "@/lib/db";
import { mobileSignInEnabled } from "@/lib/mobileSignIn";
import { limitByIp } from "@/lib/rateLimit";
import { appSecret } from "@/lib/secrets";
import { handle, HttpError } from "@/lib/session";
import { appUrl } from "@/lib/stripe";

const Body = z.object({ code: z.string().min(20).max(100), verifier: z.string().min(43).max(128) });
const MAX_AGE = 30 * 24 * 60 * 60;

/** Trade a one-time code plus the app's PKCE verifier for a session the app sends as a cookie. */
export const POST = handle(async (req: Request) => {
  if (!mobileSignInEnabled()) throw new HttpError(404, "Not found");
  const body = Body.safeParse(await req.json());
  await limitByIp("mobile-exchange", 20, 600);
  if (!body.success) throw new HttpError(400, "Invalid request");
  const codeHash = crypto.createHash("sha256").update(body.data.code).digest("hex");
  // Mark used atomically so a code works exactly once.
  const claimed = await db.mobileCode.updateMany({ where: { codeHash, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
  if (claimed.count !== 1) throw new HttpError(400, "That sign-in has expired. Try again from the app.");
  const row = await db.mobileCode.findUniqueOrThrow({ where: { codeHash } });
  const expected = Buffer.from(row.challenge);
  const actual = Buffer.from(crypto.createHash("sha256").update(body.data.verifier).digest("base64url"));
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) throw new HttpError(400, "That sign-in has expired. Try again from the app.");

  const user = await db.user.findUnique({ where: { id: row.userId } });
  if (!user) throw new HttpError(400, "That account no longer exists.");
  const cookie = appUrl().startsWith("https://") ? "__Secure-authjs.session-token" : "authjs.session-token";
  const token = await encode({ token: { sub: user.id, email: user.email, name: user.name }, secret: appSecret(), salt: cookie, maxAge: MAX_AGE });
  await db.mobileCode.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 86_400_000) } } });
  return Response.json({ cookie, token });
});
