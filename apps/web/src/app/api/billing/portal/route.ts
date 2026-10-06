import { handle, HttpError, requireUser } from "@/lib/session";
import { appUrl, stripe } from "@/lib/stripe";

export const POST = handle(async () => {
  const { workspace } = await requireUser();
  if (!workspace.stripeCustomerId) throw new HttpError(400, "No subscription yet");
  const session = await stripe().billingPortal.sessions.create({
    customer: workspace.stripeCustomerId,
    return_url: appUrl("/settings/billing"),
  });
  return Response.json({ url: session.url });
});
