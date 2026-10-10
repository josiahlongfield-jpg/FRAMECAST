import { z } from "zod";
import { db } from "@/lib/db";
import { ACTIVE_STATUSES, catalogKey, changeAddOns, intervalOf, priceId } from "@/lib/billing";
import { applyBackupSetting } from "@/lib/retention";
import { handle, HttpError, requireRole, requireUser } from "@/lib/session";
import { stripe } from "@/lib/stripe";
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
  if (!workspace.stripeSubscriptionId) throw new HttpError(400, "Upgrade to a paid plan to add cloud backup");

  const sub = await stripe().subscriptions.retrieve(workspace.stripeSubscriptionId);
  if (!ACTIVE_STATUSES.has(sub.status)) throw new HttpError(400, "Your subscription is not active");
  const price = await priceId(catalogKey("cloud_backup", intervalOf(sub)));
  const item = sub.items.data.find((i) => i.price.id === price);
  const { payUrl } =
    body.data.enabled && !item
      ? await changeAddOns(sub, [{ price, quantity: 1 }], { adds: true })
      : await changeAddOns(sub, !body.data.enabled && item ? [{ id: item.id, deleted: true }] : [], { adds: false });
  if (payUrl) return Response.json({ error: "Your card couldn't be charged. Pay the invoice to finish.", url: payUrl }, { status: 402 });

  await db.workspace.update({ where: { id: workspace.id }, data: { cloudBackup: body.data.enabled } });
  if (workspace.cloudBackup !== body.data.enabled) await applyBackupSetting(workspace.id, body.data.enabled);
  return Response.json({ cloudBackup: body.data.enabled });
});
