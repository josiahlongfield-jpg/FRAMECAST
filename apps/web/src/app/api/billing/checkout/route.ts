import { z } from "zod";
import { db } from "@/lib/db";
import { stripePriceFor } from "@/lib/plans";
import { handle, HttpError, requireUser } from "@/lib/session";
import { appUrl, stripe } from "@/lib/stripe";

const Body = z.object({ plan: z.enum(["PRO", "BUSINESS"]), seats: z.number().int().min(1).max(1000).default(1) });

export const POST = handle(async (req: Request) => {
  const { user, workspace } = await requireUser();
  const body = Body.safeParse(await req.json());
  if (!body.success) throw new HttpError(400, "Invalid plan");
  const price = stripePriceFor(body.data.plan);
  if (!price) throw new HttpError(503, "Price not configured");

  let customer = workspace.stripeCustomerId;
  if (!customer) {
    const c = await stripe().customers.create({ email: user.email, name: workspace.name, metadata: { workspaceId: workspace.id } });
    customer = c.id;
    await db.workspace.update({ where: { id: workspace.id }, data: { stripeCustomerId: customer } });
  }

  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer,
    line_items: [{ price, quantity: body.data.seats }],
    allow_promotion_codes: true,
    subscription_data: { metadata: { workspaceId: workspace.id } },
    success_url: appUrl("/settings/billing?upgraded=1"),
    cancel_url: appUrl("/pricing"),
  });
  return Response.json({ url: session.url });
});
