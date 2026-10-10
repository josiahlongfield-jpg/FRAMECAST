import { restoreClient } from "@/lib/clientRemoval";
import { rateLimit } from "@/lib/rateLimit";
import { handle, requireRole, requireUser } from "@/lib/session";

/**
 * Bring back a removed client within their 30 days. Uses a free seat; if the
 * team's keys were reset since they were removed, they get a new link.
 */
export const POST = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const me = await requireUser();
  requireRole(me, "OWNER", "ADMIN");
  await rateLimit(`client-edit:${me.workspace.id}`, 30, 3600);
  return Response.json(await restoreClient(me.workspace, id));
});
