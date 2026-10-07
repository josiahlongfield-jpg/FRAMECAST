import { db } from "@/lib/db";
import { applyRekey, RekeyBody } from "@/lib/rekey";
import { handle, HttpError, requireRole, requireUser } from "@/lib/session";
import { rateLimit } from "@/lib/rateLimit";

/**
 * Everything sealed with the team key or a client key, so an owner's or
 * admin's browser can re-seal it under new keys when someone leaves. All of
 * it is ciphertext or wrapped keys.
 */
export const GET = handle(async () => {
  const me = await requireUser();
  requireRole(me, "OWNER", "ADMIN");
  const workspaceId = me.workspace.id;
  const [clients, videos, items] = await Promise.all([
    db.client.findMany({ where: { workspaceId, teamKeyWrap: { not: null } }, select: { id: true, teamKeyWrap: true, removedAt: true, name: true, email: true } }),
    db.video.findMany({ where: { workspaceId, teamKeyWrap: { not: null } }, select: { id: true, teamKeyWrap: true, clientKeyWrap: true, clientId: true } }),
    db.item.findMany({ where: { workspaceId }, select: { id: true, body: true, clientId: true, shared: true } }),
  ]);
  return Response.json({
    fingerprint: me.workspace.keyFingerprint,
    clients: clients.map((c) => ({ id: c.id, name: c.name, hasEmail: !!c.email, teamKeyWrap: c.teamKeyWrap, active: !c.removedAt })),
    videos,
    items,
  });
});

/**
 * Reset the keys without removing anyone: used when someone left on their
 * own (deleted their account) and still holds the old keys.
 */
export const POST = handle(async (req: Request) => {
  const me = await requireUser();
  requireRole(me, "OWNER", "ADMIN");
  await rateLimit(`rekey:${me.workspace.id}`, 20, 3600);
  const body = RekeyBody.safeParse(await req.json());
  if (!body.success) throw new HttpError(400, "Invalid key reset");
  return Response.json(await applyRekey(me.workspace, body.data));
});
