import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import Resend from "next-auth/providers/resend";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/lib/db";

const providers: Provider[] = [];

// Google verifies email addresses, so it may sign into an account first
// created with an email link (and vice versa).
if (process.env.AUTH_GOOGLE_ID) providers.push(Google({ allowDangerousEmailAccountLinking: true }));

/**
 * One-time sign-in links by email. Live when RESEND_API_KEY is set; locally
 * AUTH_EMAIL_LINKS=true writes the emails to .data/outbox instead.
 */
const emailLinks = !!process.env.RESEND_API_KEY || process.env.AUTH_EMAIL_LINKS === "true";
if (emailLinks) {
  providers.push(
    Resend({
      id: "email",
      name: "Email",
      apiKey: process.env.RESEND_API_KEY ?? "unused",
      from: process.env.MAIL_FROM,
      async sendVerificationRequest({ identifier, url }) {
        const { sendMail } = await import("@/lib/mail");
        const { signInEmail } = await import("@/lib/signInEmail");
        await sendMail({ to: identifier, ...signInEmail(url, new URL(url).host) });
      },
    }),
  );
}

/** Shared password that protects a hosted preview's email sign-in. */
export const previewPassword = process.env.PREVIEW_PASSWORD || null;

// Email-only sign in for local development and demos. Never enable in
// production; on a hosted preview, also set PREVIEW_PASSWORD. Switched off
// automatically once real email links are configured.
const devLogin = process.env.AUTH_DEV_LOGIN === "true" && !emailLinks;
if (devLogin) {
  providers.push(
    Credentials({
      id: "dev",
      name: "Dev login",
      credentials: { email: { label: "Email", type: "email" }, password: { label: "Preview password", type: "password" } },
      async authorize(creds) {
        const email = String(creds?.email ?? "").trim().toLowerCase();
        if (!email.includes("@")) return null;
        if (previewPassword && String(creds?.password ?? "") !== previewPassword) return null;
        return db.user.upsert({ where: { email }, update: {}, create: { email, name: email.split("@")[0] } });
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: "jwt" },
  providers,
  pages: { signIn: "/login", verifyRequest: "/login/check", error: "/login" },
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});

/** Which sign-in options the login page should render. */
export const authProviders = [
  ...(process.env.AUTH_GOOGLE_ID ? [{ id: "google", name: "Google" }] : []),
  ...(emailLinks ? [{ id: "email", name: "Email" }] : []),
  ...(devLogin ? [{ id: "dev", name: "Dev login" }] : []),
];
