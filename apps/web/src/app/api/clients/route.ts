import { z } from "zod";
import { db } from "@/lib/db";
import { clientLink, newClientToken, seatUsage } from "@/lib/clients";
import { handle, HttpError, requireUser } from "@/lib/session";
import { limitByIp } from "@/lib/rateLimit";
import { KeyFingerprint, requireCurrentKey } from "@/lib/keys";
import { accessOf, clientScopeWhere, requirePerm } from "@/lib/permissions";

const Body = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(200).optional().or(z.literal("").transform(() => undefined)),
  /** The client's new key, wrapped with the team key on the trainer's device. */
  teamKeyWrap: z.string().min(40).max(200),
  keyFingerprint: KeyFingerprint,
});

export const GET = handle(async () => {
  const me = await requireUser();
  const { workspace } = me;
  const clients = await db.client.findMany({
    where: { ...clientScopeWhere(accessOf(me)), removedAt: null },
    orderBy: { name: "asc" },
    include: { _count: { select: { videos: true } } },
  });
  return Response.json({
    seats: await seatUsage(workspace),
    clients: clients.map((c) => ({ id: c.id, name: c.name, email: c.email, link: clientLink(c.token), teamKeyWrap: c.teamKeyWrap, videoCount: c._count.videos, assignedToId: c.assignedToId })),
  });
});

/** Add a client. Each active client uses one seat; clients never pay. */
export const POST = handle(async (req: Request) => {
  const me = await requireUser();
  const { user, workspace, role } = me;
  requirePerm(accessOf(me), "addClients", "Ask the owner or an admin to add new clients");
  const body = Body.safeParse(await req.json());
  await limitByIp("clients", 30, 3600);
  if (!body.success) throw new HttpError(400, "Enter a name and, optionally, a valid email");
  await requireCurrentKey(workspace, body.data.keyFingerprint);
  const seats = await seatUsage(workspace);
  if (seats.used >= seats.limit) {
    throw new HttpError(402, `All ${seats.limit} client seats are in use. Add more seats or remove a client first.`);
  }
  const c = await db.client.create({ data: { name: body.data.name, email: body.data.email, teamKeyWrap: body.data.teamKeyWrap, token: newClientToken(), workspaceId: workspace.id, assignedToId: role === "MEMBER" ? user.id : null } });
  return Response.json({ client: { id: c.id, name: c.name, email: c.email, link: clientLink(c.token), teamKeyWrap: c.teamKeyWrap, videoCount: 0, assignedToId: c.assignedToId } }, { status: 201 });
});
