import { z } from "zod";
import { db } from "@/lib/db";
import { memberOrClient } from "@/lib/access";
import { itemDTO } from "@/lib/items";
import { handle, HttpError } from "@/lib/session";

const Create = z.object({
  kind: z.enum(["TASK", "NOTE"]),
  body: z.string().min(20).max(20000), // already encrypted on the device
  clientId: z.string().nullable().optional(),
  shared: z.boolean().default(false),
  dueAt: z.string().datetime().nullable().optional(),
});

/** Tasks and notes: general ones, or one client's. A client sees only what is shared with them. */
export const GET = handle(async (req: Request) => {
  const clientId = new URL(req.url).searchParams.get("clientId");
  const who = await memberOrClient(clientId);
  const items = await db.item.findMany({
    where: {
      workspaceId: who.workspaceId,
      clientId: clientId ?? null,
      ...(who.kind === "client" ? { shared: true } : {}),
    },
    orderBy: [{ done: "asc" }, { dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
  });
  return Response.json({ items: items.map(itemDTO) });
});

export const POST = handle(async (req: Request) => {
  const body = Create.safeParse(await req.json());
  if (!body.success) throw new HttpError(400, "Invalid item");
  const who = await memberOrClient(body.data.clientId ?? null);
  if (who.kind !== "member") throw new HttpError(403, "Only the business you work with can add items");
  if (body.data.shared && !body.data.clientId) throw new HttpError(400, "Only client items can be shared");
  const item = await db.item.create({
    data: {
      kind: body.data.kind,
      body: body.data.body,
      shared: body.data.shared,
      dueAt: body.data.dueAt ? new Date(body.data.dueAt) : null,
      clientId: body.data.clientId ?? null,
      workspaceId: who.workspaceId,
      authorName: who.me.user.name ?? who.me.user.email.split("@")[0],
    },
  });
  return Response.json({ item: itemDTO(item) }, { status: 201 });
});
