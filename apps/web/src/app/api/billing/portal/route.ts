import { portalConfiguration } from "@/lib/billing";
import { handle, HttpError, requireRole, requireUser } from "@/lib/session";
import { appUrl, stripe } from "@/lib/stripe";
import { limitByIp } from "@/lib/rateLimit";
import { currentCustomer } from "@/lib/subscription";

export const POST = handle(async () => {
  await limitByIp("billing", 20, 600);
  // The owner of a suspended workspace can still manage or cancel the subscription (from the suspended page).
  const me = await requireUser({ allowSuspendedWorkspace: true });
  requireRole(me, "OWNER");
  const { workspace } = me;
  // A customer deleted in Stripe (or from test mode) is forgotten rather than failing here.
  const customer = await currentCustomer(workspace);
  if (!customer) throw new HttpError(400, "No subscription yet");
  const session = await stripe().billingPortal.sessions.create({
    customer,
    configuration: await portalConfiguration(),
    return_url: appUrl(me.suspended ? "/suspended" : "/settings/billing"),
  });
  return Response.json({ url: session.url });
});
