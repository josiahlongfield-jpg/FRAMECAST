import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { clientCookie, REMOVED_COOKIE } from "@/lib/access";

/**
 * A client's personal link. Remembers them on this device (no password or
 * account needed) and opens the requested video or their inbox.
 */
export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const client = await db.client.findUnique({ where: { token }, include: { workspace: { select: { deleteAt: true } } } });
  const url = new URL(req.url);
  if (!client) return Response.redirect(new URL("/inbox?invalid=1", url), 302);
  if (client.removedAt) {
    // The business ended their access. Their inbox says who and until when (it can still be restored),
    // from this short-lived note, without remembering them on this device.
    (await cookies()).set(REMOVED_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: url.protocol === "https:", path: "/inbox", maxAge: 600 });
    return Response.redirect(new URL("/inbox?removed=1", url), 302);
  }
  if (client.workspace.deleteAt) {
    // The business closed its account (lib/accountDeletion.ts). The same short-lived note lets their inbox say who.
    (await cookies()).set(REMOVED_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: url.protocol === "https:", path: "/inbox", maxAge: 600 });
    return Response.redirect(new URL("/inbox?closed=1", url), 302);
  }
  // The business's plan no longer covers this client (lib/seatLimits.ts).
  if (client.pausedAt) return Response.redirect(new URL("/inbox?paused=1", url), 302);

  (await cookies()).set(clientCookie(client.workspaceId), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: url.protocol === "https:",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  const v = url.searchParams.get("v");
  // The browser carries the link's #k=… fragment (the client's key) through this redirect.
  const dest = v && /^[a-z0-9]{6,20}$/.test(v) ? `/v/${v}` : `/inbox?c=${client.id}`;
  return Response.redirect(new URL(dest, url), 302);
}
