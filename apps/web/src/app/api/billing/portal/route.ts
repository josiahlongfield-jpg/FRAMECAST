import { portalConfiguration } from "@/lib/billing";
import { handle, HttpError, requireRole, requireUser } from "@/lib/session";
import { appUrl, stripe } from "@/lib/stripe";
import { limitByIp } from "@/lib/rateLimit";
import { currentCustomer } from "@/lib/subscription";

export const POST = handle(async () => {
  await limitByIp("billing", 20, 600);
  // The owner can still manage or cancel the subscription while suspended (from the suspended page), and before
  // agreeing to updated terms (from Settings > Account), so declining them never leaves a plan renewing.
  const me = await requireUser({ allowSuspendedOwner: true, allowTermsPending: true });
  requireRole(me, "OWNER");
  const { workspace } = me;
  // A customer deleted in Stripe (or from test mode) is forgotten rather than failing here.
  const customer = await currentCustomer(workspace);
  if (!customer) throw new HttpError(400, "No subscription yet");
  const session = await stripe().billingPortal.sessions.create({
    customer,
    configuration: await portalConfiguration(),
    return_url: appUrl(me.suspended ? "/suspended" : me.agreed ? "/settings/billing" : "/settings/account"),
  });
  return Response.json({ url: session.url });
});
