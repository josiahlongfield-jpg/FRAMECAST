import { z } from "zod";
import { portalConfiguration } from "@/lib/billing";
import { handle, HttpError, requireRole, requireUser } from "@/lib/session";
import { appUrl, stripe } from "@/lib/stripe";
import { limitByIp } from "@/lib/rateLimit";

const Body = z.object({ back: z.enum(["/pricing", "/settings/billing"]).default("/settings/billing") });

/** Opens Stripe's page for changing the card on the subscription, then comes back here. */
export const POST = handle(async (req: Request) => {
  await limitByIp("billing", 20, 600);
  const me = await requireUser();
  requireRole(me, "OWNER");
  const { back } = Body.parse(await req.json().catch(() => ({})));
  if (!me.workspace.stripeCustomerId) throw new HttpError(400, "No subscription yet");
  const session = await stripe().billingPortal.sessions.create({
    customer: me.workspace.stripeCustomerId,
    configuration: await portalConfiguration(),
    flow_data: { type: "payment_method_update", after_completion: { type: "redirect", redirect: { return_url: appUrl(back) } } },
    return_url: appUrl(back),
  });
  return Response.json({ url: session.url });
});
