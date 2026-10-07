import { db } from "@/lib/db";
import { memberOrClient } from "@/lib/access";
import { rotationDTO } from "@/lib/keys";
import { handle } from "@/lib/session";

/**
 * How a client's device gets from an older client key to the current one.
 * Only the client themselves (with their current link) or the team.
 */
export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  await memberOrClient(id);
  const [client, rotations] = await Promise.all([
    db.client.findUnique({ where: { id }, select: { keyFingerprint: true } }),
    db.keyRotation.findMany({ where: { clientId: id }, orderBy: { createdAt: "asc" } }),
  ]);
  return Response.json({ fingerprint: client?.keyFingerprint ?? null, rotations: rotations.map(rotationDTO) });
});
