import { db } from "@/lib/db";
import { rotationDTO } from "@/lib/keys";
import { handle, requireUser } from "@/lib/session";

/**
 * How a member's device gets from an older team key to the current one after
 * the keys were reset. Only current members get these.
 */
export const GET = handle(async () => {
  const { workspace } = await requireUser();
  const rotations = await db.keyRotation.findMany({ where: { workspaceId: workspace.id, clientId: null }, orderBy: { createdAt: "asc" } });
  return Response.json({ fingerprint: workspace.keyFingerprint, rotations: rotations.map(rotationDTO) });
});
