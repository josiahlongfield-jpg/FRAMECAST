import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/lib/db";

const providers: Provider[] = [];

if (process.env.AUTH_GOOGLE_ID) providers.push(Google);

// Email-only sign in for local development and demos. Never enable in production.
if (process.env.AUTH_DEV_LOGIN === "true") {
  providers.push(
    Credentials({
      id: "dev",
      name: "Dev login",
      credentials: { email: { label: "Email", type: "email" } },
      async authorize(creds) {
        const email = String(creds?.email ?? "").trim().toLowerCase();
        if (!email.includes("@")) return null;
        return db.user.upsert({ where: { email }, update: {}, create: { email, name: email.split("@")[0] } });
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: "jwt" },
  providers,
  pages: { signIn: "/login" },
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
  ...(process.env.AUTH_DEV_LOGIN === "true" ? [{ id: "dev", name: "Dev login" }] : []),
];
