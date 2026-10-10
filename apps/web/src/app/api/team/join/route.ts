import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { handle, HttpError } from "@/lib/session";
import { limitByIp } from "@/lib/rateLimit";
import { hashToken, staffUsage } from "@/lib/team";

const Body = z.object({ token: z.string().min(20).max(100) });

/**
 * Accept an invite. Deliberately doesn't use currentUser(), which would
 * create a personal workspace for someone who only came to join a team.
 * Returns the wrapped team key so the browser can unwrap it with the
 * one-off key from the link's #fragment.
 */
export const POST = handle(async (req: Request) => {
  await limitByIp("join", 30, 3600);
  const userId = (await auth())?.user?.id;
  // A browser still holding a sign-in for an account deleted elsewhere.
  const me = userId ? await db.user.findUnique({ where: { id: userId }, select: { email: true } }) : null;
  if (!userId || !me) throw new HttpError(401, "Sign in required");
  const body = Body.safeParse(await req.json());
  if (!body.success) throw new HttpError(400, "This invite link is incomplete");
  const invite = await db.invite.findUnique({ where: { tokenHash: hashToken(body.data.token) }, include: { workspace: true } });
  if (!invite || invite.revokedAt) throw new HttpError(404, "This invite was cancelled or doesn't exist. Ask for a new one.");

  // An invite made out to an address only works for that address.
  if (invite.email) {
    if (me.email?.toLowerCase() !== invite.email.toLowerCase()) {
      throw new HttpError(403, `This invite is for ${invite.email}. Sign in with that address to accept it.`);
    }
  }
  const existing = await db.membership.findUnique({ where: { userId_workspaceId: { userId, workspaceId: invite.workspaceId } } });
  // The same person opening their link again (say, on a second device) gets the key again.
  const again = invite.acceptedAt && invite.acceptedById === userId;
  // Someone already on the team opening a link made out to nobody in particular (say, to try it)
  // gets the team key, but the invite stays free for the person it was meant for.
  const alreadyHere = !!existing && !invite.email;
  if (!again && !alreadyHere) {
    if (invite.acceptedAt) throw new HttpError(410, "This invite has already been used. Ask for a new one.");
    if (invite.expiresAt < new Date()) throw new HttpError(410, "This invite has expired. Ask for a new one.");
    await db.$transaction(async (tx) => {
      // One join at a time per team, so two people can't both take the last seat.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"seats:" + invite.workspaceId}))`;
      if (!existing) {
        // This invite already holds one of the seats it is counted against.
        const seats = await staffUsage(invite.workspace, tx);
        if (seats.members >= seats.limit) throw new HttpError(402, "This team has no free staff logins. Ask the owner to add one.");
      }
      const res = await tx.invite.updateMany({ where: { id: invite.id, acceptedAt: null }, data: { acceptedAt: new Date(), acceptedById: userId } });
      if (res.count === 0) throw new HttpError(410, "This invite has already been used. Ask for a new one.");
      if (!existing) await tx.membership.create({ data: { userId, workspaceId: invite.workspaceId, role: invite.role } });
    });
  }
  if (!existing && again) throw new HttpError(410, "You were removed from this team. Ask for a new invite.");
  await db.user.update({ where: { id: userId }, data: { activeWorkspaceId: invite.workspaceId } });
  return Response.json({ workspaceId: invite.workspaceId, workspaceName: invite.workspace.name, fingerprint: invite.workspace.keyFingerprint, teamKeyWrap: invite.teamKeyWrap });
});
