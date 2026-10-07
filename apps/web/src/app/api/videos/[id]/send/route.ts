import { z } from "zod";
import { db } from "@/lib/db";
import { KeyFingerprint, requireCurrentKey } from "@/lib/keys";
import { limitByIp } from "@/lib/rateLimit";
import { handle, HttpError, requireUser } from "@/lib/session";
import { newVideoId, ownedVideo } from "@/lib/videos";
import { brandOf } from "@/lib/branding";
import { clientLink } from "@/lib/clients";
import { sendMail } from "@/lib/mail";
import { newVideoEmail } from "@/lib/newVideoEmail";
import { appUrl } from "@/lib/stripe";

const Body = z.object({
  /** Each client, with this video's key wrapped with their key on the sender's device. */
  recipients: z.array(z.object({ clientId: z.string().min(1).max(40), clientKeyWrap: z.string().min(40).max(200) })).min(1).max(500),
  keyFingerprint: KeyFingerprint,
  /** Email clients who have an address that a video is waiting. */
  notify: z.boolean().default(true),
});

/**
 * Send one recording to several clients at once. Each client gets their own
 * copy with a private conversation, so nobody sees anyone else's replies.
 * Copies share the original's stored file; nothing is uploaded again.
 */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const { workspace } = await requireUser();
  await limitByIp("send", 60, 600);
  const body = Body.safeParse(await req.json());
  if (!body.success) throw new HttpError(400, "Choose at least one client");
  await requireCurrentKey(workspace, body.data.keyFingerprint);
  const video = await ownedVideo(id, workspace.id);
  if (video.replyToId || video.sourceId) throw new HttpError(400, "Send the original video instead");
  if (video.status === "RECORDING") throw new HttpError(409, "Wait for the upload to finish before sending it to more clients");
  if (!video.encrypted) throw new HttpError(400, "This video can't be sent to more clients");

  const wanted = [...new Map(body.data.recipients.map((r) => [r.clientId, r])).values()];
  const [clients, already] = await Promise.all([
    db.client.findMany({ where: { id: { in: wanted.map((r) => r.clientId) }, workspaceId: workspace.id, removedAt: null }, select: { id: true, name: true, email: true, token: true, remindersOff: true } }),
    db.video.findMany({ where: { sourceId: id }, select: { clientId: true } }),
  ]);
  if (clients.length !== wanted.length) throw new HttpError(400, "One of those clients isn't in your workspace");
  // Someone who already has it keeps their existing conversation.
  const has = new Set([video.clientId, ...already.map((c) => c.clientId)].filter(Boolean));
  const fresh = wanted.filter((r) => !has.has(r.clientId));

  const copies = fresh.map((r) => ({
    id: newVideoId(),
    sourceId: video.id,
    title: video.title,
    status: video.status,
    mimeType: video.mimeType,
    durationMs: video.durationMs,
    sizeBytes: video.sizeBytes,
    storageKey: video.storageKey,
    playbackUrl: video.playbackUrl,
    thumbnailUrl: video.thumbnailUrl,
    expiresAt: video.expiresAt,
    purgeAt: video.purgeAt,
    encrypted: true,
    teamKeyWrap: video.teamKeyWrap,
    ownerId: video.ownerId,
    workspaceId: workspace.id,
    clientId: r.clientId,
    clientKeyWrap: r.clientKeyWrap,
    createdAt: video.createdAt,
  }));
  if (copies.length) await db.video.createMany({ data: copies });

  let emailed = 0;
  if (body.data.notify) {
    const byId = new Map(clients.map((c) => [c.id, c]));
    const brand = brandOf(workspace, appUrl(""));
    for (const copy of copies) {
      const c = byId.get(copy.clientId)!;
      if (!c.email || c.remindersOff) continue;
      try {
        await sendMail({ to: c.email, ...newVideoEmail({ business: workspace.name, clientName: c.name, link: clientLink(c.token, copy.id), logoUrl: brand.logoUrl, color: brand.color }), fromName: workspace.name, replyTo: workspace.reminderReplyTo });
        emailed++;
      } catch (err) {
        console.error("new video email failed", err);
      }
    }
  }
  return Response.json({ sent: copies.map((c) => ({ id: c.id, clientId: c.clientId })), skipped: wanted.length - fresh.length, emailed }, { status: 201 });
});
