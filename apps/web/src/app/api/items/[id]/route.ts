import { z } from "zod";
import { db } from "@/lib/db";
import { memberOrClient } from "@/lib/access";
import { itemDTO } from "@/lib/items";
import { handle, HttpError } from "@/lib/session";

const Patch = z.object({
  done: z.boolean().optional(),
  // Changing text or sharing sends a freshly encrypted body (sealed with the right key).
  body: z.string().min(20).max(20000).optional(),
  shared: z.boolean().optional(),
  dueAt: z.string().datetime().nullable().optional(),
});

async function load(id: string) {
  const item = await db.item.findUnique({ where: { id } });
  if (!item) throw new HttpError(404, "Not found");
  const who = await memberOrClient(item.clientId);
  if (who.workspaceId !== item.workspaceId) throw new HttpError(404, "Not found");
  if (who.kind === "client" && !item.shared) throw new HttpError(404, "Not found");
  return { item, who };
}

export const PATCH = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const { item, who } = await load(id);
  const body = Patch.safeParse(await req.json());
  if (!body.success) throw new HttpError(400, "Invalid update");
  const d = body.data;
  if (who.kind === "client") {
    // Clients can only tick off tasks shared with them.
    if (item.kind !== "TASK" || d.body !== undefined || d.shared !== undefined || d.dueAt !== undefined) {
      throw new HttpError(403, "Not allowed");
    }
  }
  if (d.shared && !item.clientId) throw new HttpError(400, "Only client items can be shared");
  if (d.shared !== undefined && d.shared !== item.shared && d.body === undefined) {
    throw new HttpError(400, "Sharing changes which key seals the text; send the re-encrypted body");
  }
  const updated = await db.item.update({
    where: { id },
    data: { done: d.done, body: d.body, shared: d.shared, dueAt: d.dueAt === undefined ? undefined : d.dueAt ? new Date(d.dueAt) : null },
  });
  return Response.json({ item: itemDTO(updated) });
});

export const DELETE = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const { who } = await load(id);
  if (who.kind !== "member") throw new HttpError(403, "Not allowed");
  await db.item.delete({ where: { id } });
  return new Response(null, { status: 204 });
});
