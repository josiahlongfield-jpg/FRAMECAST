import { portalConfiguration } from "@/lib/billing";
import { handle, HttpError, requireUser } from "@/lib/session";
import { appUrl, stripe } from "@/lib/stripe";
import { limitByIp } from "@/lib/rateLimit";

export const POST = handle(async () => {
  await limitByIp("billing", 20, 600);
  const { workspace } = await requireUser();
  if (!workspace.stripeCustomerId) throw new HttpError(400, "No subscription yet");
  const session = await stripe().billingPortal.sessions.create({
    customer: workspace.stripeCustomerId,
    configuration: await portalConfiguration(),
    return_url: appUrl("/settings/billing"),
  });
  return Response.json({ url: session.url });
});
