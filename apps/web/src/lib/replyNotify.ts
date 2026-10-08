import { db } from "@/lib/db";
import { brandOf } from "@/lib/branding";
import { sendMail } from "@/lib/mail";
import { replyEmail } from "@/lib/replyEmail";
import { appUrl } from "@/lib/stripe";

/** A burst of replies in one conversation sends at most one email in this window. */
export const REPLY_NOTIFY_WINDOW_MS = 15 * 60 * 1000;

/**
 * Email the team member looking after this conversation that the client
 * replied: the staff member assigned to the client, else whoever recorded
 * the video, else the owner. Only current team members are emailed.
 * Never throws: a failed email mustn't fail the client's reply.
 */
export async function notifyClientReply(conversationId: string, now = new Date()) {
  try {
    const video = await db.video.findUnique({
      where: { id: conversationId },
      include: { client: true, workspace: { include: { members: { include: { user: { select: { id: true, email: true } } }, orderBy: { id: "asc" } } } } },
    });
    if (!video || video.replyToId || !video.client) return null;
    const ws = video.workspace;
    const member = (id: string | null | undefined) => (id ? ws.members.find((m) => m.userId === id) : undefined);
    const to = (member(video.client.assignedToId) ?? member(video.ownerId) ?? ws.members.find((m) => m.role === "OWNER"))?.user;
    if (!to) return null;

    // Claim the window atomically so simultaneous replies send one email.
    const claimed = await db.video.updateMany({
      where: { id: video.id, OR: [{ replyNotifiedAt: null }, { replyNotifiedAt: { lt: new Date(now.getTime() - REPLY_NOTIFY_WINDOW_MS) } }] },
      data: { replyNotifiedAt: now },
    });
    if (claimed.count === 0) return null;

    const brand = brandOf(ws, appUrl(""));
    const m = replyEmail({ business: ws.name, clientName: video.client.name, link: appUrl(`/v/${video.id}`), logoUrl: brand.logoUrl, color: brand.color });
    await sendMail({ to: to.email, ...m, fromName: ws.name });
    return to.email;
  } catch (err) {
    console.error("reply notification failed", err);
    return null;
  }
}
