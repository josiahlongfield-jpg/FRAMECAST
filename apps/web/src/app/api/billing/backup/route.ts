import { z } from "zod";
import { db } from "@/lib/db";
import { ACTIVE_STATUSES, addOnChanges, catalogKey, changeAddOns, intervalOf, priceId, unpaid } from "@/lib/billing";
import { applyBackupSetting } from "@/lib/retention";
import { handle, HttpError, requireRole, requireUser } from "@/lib/session";
import { currentSubscription } from "@/lib/subscription";
import { limitByIp } from "@/lib/rateLimit";

const Body = z.object({ enabled: z.boolean() });

/** Optional paid add-on: keep encrypted copies on the server instead of letting them expire. */
export const POST = handle(async (req: Request) => {
  const me = await requireUser();
  requireRole(me, "OWNER");
  const { workspace } = me;
  const body = Body.safeParse(await req.json());
  await limitByIp("billing", 20, 600);
  if (!body.success) throw new HttpError(400, "Invalid request");
  const sub = await currentSubscription(workspace);
  if (!sub) throw new HttpError(400, "Start a paid subscription to add cloud backup");
  if (!ACTIVE_STATUSES.has(sub.status)) throw new HttpError(400, "Your subscription is not active");
  const price = await priceId(catalogKey("cloud_backup", intervalOf(sub)));
  const charge = await changeAddOns(sub, addOnChanges(sub, "cloud_backup", price, body.data.enabled ? 1 : 0), { adds: body.data.enabled && !workspace.cloudBackup });
  if (!charge.paid) return unpaid(charge);

  await db.workspace.update({ where: { id: workspace.id }, data: { cloudBackup: body.data.enabled } });
  if (workspace.cloudBackup !== body.data.enabled) await applyBackupSetting(workspace.id, body.data.enabled);
  return Response.json({ cloudBackup: body.data.enabled });
});
