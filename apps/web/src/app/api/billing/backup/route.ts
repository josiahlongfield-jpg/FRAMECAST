import { z } from "zod";
import { db } from "@/lib/db";
import { applyBackupSetting } from "@/lib/retention";
import { handle, HttpError, requireUser } from "@/lib/session";
import { stripe } from "@/lib/stripe";

const Body = z.object({ enabled: z.boolean() });

/** Optional paid add-on: keep encrypted copies on the server instead of letting them expire. */
export const POST = handle(async (req: Request) => {
  const { workspace } = await requireUser();
  const body = Body.safeParse(await req.json());
  if (!body.success) throw new HttpError(400, "Invalid request");
  const price = process.env.STRIPE_PRICE_CLOUD_BACKUP;
  if (!price) throw new HttpError(503, "Cloud backup is not configured yet");
  if (!workspace.stripeSubscriptionId) throw new HttpError(400, "Upgrade to a paid plan to add cloud backup");

  const sub = await stripe().subscriptions.retrieve(workspace.stripeSubscriptionId);
  const item = sub.items.data.find((i) => i.price.id === price);
  if (body.data.enabled && !item) await stripe().subscriptions.update(sub.id, { items: [{ price, quantity: 1 }] });
  if (!body.data.enabled && item) await stripe().subscriptions.update(sub.id, { items: [{ id: item.id, deleted: true }] });

  await db.workspace.update({ where: { id: workspace.id }, data: { cloudBackup: body.data.enabled } });
  await applyBackupSetting(workspace.id, body.data.enabled);
  return Response.json({ cloudBackup: body.data.enabled });
});
