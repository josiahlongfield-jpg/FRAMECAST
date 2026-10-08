import { db } from "@/lib/db";
import { brandOf } from "@/lib/branding";
import { clientLink } from "@/lib/clients";
import { sendMail } from "@/lib/mail";
import { newVideoEmail } from "@/lib/newVideoEmail";
import { appUrl } from "@/lib/stripe";

/**
 * Emails a client that a video is waiting, if they have an address and want
 * emails. The email carries no key: it opens on devices where the client has
 * already used their personal link. Returns whether an email went out.
 */
export async function emailClientVideo(videoId: string) {
  const video = await db.video.findUnique({
    where: { id: videoId },
    include: { client: true, workspace: true, owner: { select: { name: true } } },
  });
  const c = video?.client;
  if (!video || !c || c.removedAt || !c.email || c.remindersOff) return false;
  const ws = video.workspace;
  const brand = brandOf(ws, appUrl(""));
  try {
    await sendMail({
      to: c.email,
      ...newVideoEmail({ business: ws.name, sender: video.owner?.name, clientName: c.name, link: clientLink(c.token, video.id), logoUrl: brand.logoUrl, color: brand.color }),
      fromName: ws.name,
      replyTo: ws.reminderReplyTo,
    });
    return true;
  } catch (err) {
    console.error("new video email failed", err);
    return false;
  }
}
