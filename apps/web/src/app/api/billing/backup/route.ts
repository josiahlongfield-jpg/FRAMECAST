import { z } from "zod";
import { db } from "@/lib/db";
import { ACTIVE_STATUSES, catalogKey, intervalOf, priceId } from "@/lib/billing";
import { applyBackupSetting } from "@/lib/retention";
import { handle, HttpError, requireUser } from "@/lib/session";
import { stripe } from "@/lib/stripe";
import { limitByIp } from "@/lib/rateLimit";

const Body = z.object({ enabled: z.boolean() });

/** Optional paid add-on: keep encrypted copies on the server instead of letting them expire. */
export const POST = handle(async (req: Request) => {
  const { workspace } = await requireUser();
  const body = Body.safeParse(await req.json());
  await limitByIp("billing", 20, 600);
  if (!body.success) throw new HttpError(400, "Invalid request");
  if (!workspace.stripeSubscriptionId) throw new HttpError(400, "Upgrade to a paid plan to add cloud backup");

  const sub = await stripe().subscriptions.retrieve(workspace.stripeSubscriptionId);
  if (!ACTIVE_STATUSES.has(sub.status)) throw new HttpError(400, "Your subscription is not active");
  const price = await priceId(catalogKey("cloud_backup", intervalOf(sub)));
  const item = sub.items.data.find((i) => i.price.id === price);
  if (body.data.enabled && !item) await stripe().subscriptions.update(sub.id, { items: [{ price, quantity: 1 }] });
  if (!body.data.enabled && item) await stripe().subscriptions.update(sub.id, { items: [{ id: item.id, deleted: true }] });

  await db.workspace.update({ where: { id: workspace.id }, data: { cloudBackup: body.data.enabled } });
  await applyBackupSetting(workspace.id, body.data.enabled);
  return Response.json({ cloudBackup: body.data.enabled });
});
