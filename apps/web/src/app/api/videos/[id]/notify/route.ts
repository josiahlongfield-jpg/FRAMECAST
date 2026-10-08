import { db } from "@/lib/db";
import { limitByIp } from "@/lib/rateLimit";
import { handle, HttpError, requireUser } from "@/lib/session";
import { accessOf, visibleVideo } from "@/lib/permissions";
import { emailClientVideo } from "@/lib/emailClientVideo";

/**
 * "Send": email the client this video was sent to that it's waiting, now or
 * as soon as the upload finishes. The email carries no key (see emailClientVideo).
 */
export const POST = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const me = await requireUser();
  await limitByIp("notify", 60, 600);
  const video = await visibleVideo(accessOf(me), id);
  if (!video.clientId || video.replyToId) throw new HttpError(400, "Choose a client to send it to first");
  if (video.status === "RECORDING") {
    await db.video.update({ where: { id }, data: { emailClientWhenReady: true } });
    return Response.json({ emailed: "when-ready" });
  }
  if (!(await emailClientVideo(id))) throw new HttpError(409, "This client has no email address saved, or has turned emails off");
  return Response.json({ emailed: "sent" });
});
