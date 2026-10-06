import { z } from "zod";
import { db } from "@/lib/db";
import { clientLink, newClientToken, seatUsage } from "@/lib/clients";
import { handle, HttpError, requireUser } from "@/lib/session";
import { limitByIp } from "@/lib/rateLimit";

const Body = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(200).optional().or(z.literal("").transform(() => undefined)),
  /** The client's new key, wrapped with the team key on the trainer's device. */
  teamKeyWrap: z.string().min(40).max(200),
});

export const GET = handle(async () => {
  const { workspace } = await requireUser();
  const clients = await db.client.findMany({
    where: { workspaceId: workspace.id, removedAt: null },
    orderBy: { name: "asc" },
    include: { _count: { select: { videos: true } } },
  });
  return Response.json({
    seats: await seatUsage(workspace),
    clients: clients.map((c) => ({ id: c.id, name: c.name, email: c.email, link: clientLink(c.token), teamKeyWrap: c.teamKeyWrap, videoCount: c._count.videos })),
  });
});

/** Add a client. Each active client uses one seat; clients never pay. */
export const POST = handle(async (req: Request) => {
  const { workspace } = await requireUser();
  const body = Body.safeParse(await req.json());
  await limitByIp("clients", 30, 3600);
  if (!body.success) throw new HttpError(400, "Enter a name and, optionally, a valid email");
  const seats = await seatUsage(workspace);
  if (seats.used >= seats.limit) {
    throw new HttpError(402, `All ${seats.limit} client seats are in use. Add more seats or remove a client first.`);
  }
  const c = await db.client.create({ data: { ...body.data, token: newClientToken(), workspaceId: workspace.id } });
  return Response.json({ client: { id: c.id, name: c.name, email: c.email, link: clientLink(c.token), teamKeyWrap: c.teamKeyWrap, videoCount: 0 } }, { status: 201 });
});
