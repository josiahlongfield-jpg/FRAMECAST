import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { memberOrClient } from "@/lib/access";
import { itemDTO } from "@/lib/items";
import { ensureTimezone, scheduleReminders } from "@/lib/reminders";
import { Repeat, ReminderRules } from "@/lib/scheduleSchema";
import { handle, HttpError } from "@/lib/session";
import { limitByIp } from "@/lib/rateLimit";

const Create = z.object({
  kind: z.enum(["TASK", "NOTE"]),
  body: z.string().min(20).max(20000), // already encrypted on the device
  clientId: z.string().nullable().optional(),
  shared: z.boolean().default(false),
  dueAt: z.string().datetime().nullable().optional(),
  repeat: Repeat.nullable().optional(),
  reminders: ReminderRules.optional(),
  remindClient: z.boolean().optional(),
  remindTeam: z.boolean().optional(),
  /** The browser's time zone, adopted by the workspace if it has none yet. */
  tz: z.string().max(64).optional(),
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
  return Response.json({
    items: items.map(itemDTO).map((i) => (who.kind === "client" ? { ...i, remindTeam: false } : i)),
  });
});

export const POST = handle(async (req: Request) => {
  const body = Create.safeParse(await req.json());
  await limitByIp("items", 120, 60);
  if (!body.success) throw new HttpError(400, "Invalid item");
  const d = body.data;
  const who = await memberOrClient(d.clientId ?? null);
  if (who.kind !== "member") throw new HttpError(403, "Only the business you work with can add items");
  if (d.shared && !d.clientId) throw new HttpError(400, "Only client items can be shared");
  const isTask = d.kind === "TASK" && !!d.dueAt;
  const tz = await ensureTimezone(who.workspaceId, d.tz);
  const item = await db.item.create({
    data: {
      kind: d.kind,
      body: d.body,
      shared: d.shared,
      dueAt: d.kind === "TASK" && d.dueAt ? new Date(d.dueAt) : null,
      repeat: isTask && d.repeat ? d.repeat : Prisma.DbNull,
      reminders: isTask && d.reminders?.length ? d.reminders : Prisma.DbNull,
      remindClient: isTask && d.shared && !!d.remindClient,
      remindTeam: isTask && !!d.remindTeam,
      clientId: d.clientId ?? null,
      workspaceId: who.workspaceId,
      authorName: who.me.user.name ?? who.me.user.email.split("@")[0],
    },
  });
  await scheduleReminders(item, tz);
  return Response.json({ item: itemDTO(item) }, { status: 201 });
});
