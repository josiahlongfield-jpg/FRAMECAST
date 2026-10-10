// When each sign-in happened (src/auth.ts). A closed account can only be kept
// from a sign-in made after it was closed (lib/session.ts pendingDeletion).
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    signedInAt?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    signedInAt?: number;
  }
}
