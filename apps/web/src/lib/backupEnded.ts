import { brandOf } from "@/lib/branding";
import { zoned } from "@/lib/dates";
import { db } from "@/lib/db";
import { sendMail } from "@/lib/mail";
import { purgeDate } from "@/lib/retention";
import { appUrl } from "@/lib/stripe";
import { teamEmail } from "@/lib/teamEmail";
import { teamPath } from "@/lib/teamLink";
import { activeMember } from "@/lib/team";

/**
 * Cloud backup ended without the owner switching it off (the plan was
 * cancelled, lapsed, or Stripe no longer has it), so every recording's server
 * copy is now due for deletion. The owner hears straight away, with the date.
 */
export async function tellOwnerBackupEnded(workspaceId: string) {
  const workspace = await db.workspace.findUnique({ where: { id: workspaceId } });
  const owner = await db.membership.findFirst({ where: { workspaceId, role: "OWNER", ...activeMember }, include: { user: { select: { email: true } } } });
  // Not while the owner's account is closed: they're told what happens to their plan when they close it or keep it.
  // Not while support has it suspended (nothing is emailed in its name), or on legal hold (nothing is deleted then).
  if (!workspace || !owner || workspace.deleteAt || workspace.suspendedAt || workspace.closedAt || workspace.legalHoldAt) return;
  const left = await db.video.count({ where: { workspaceId, status: { not: "EXPIRED" }, replyToId: null, sourceId: null } });
  if (!left) return;
  const when = zoned(workspace.timezone).longDay(purgeDate(false)!);
  const brand = brandOf(workspace, appUrl(""));
  const mail = teamEmail({
    business: workspace.name,
    subject: "Cloud backup has ended for your recordings",
    lead: `Your SureFrame plan no longer includes cloud backup, so our copies of your ${left === 1 ? "recording" : `${left} recordings`} will be deleted on ${when}.`,
    lines: [
      { text: "To keep them, subscribe again with cloud backup before then, or open each video and choose Save to device." },
      { text: "Clients can't watch a recording once our copy is deleted." },
    ],
    button: { label: "Open Billing", link: appUrl(teamPath("/settings/billing", workspaceId)) },
    logoUrl: brand.logoUrl,
    color: brand.color,
  });
  await sendMail({ to: owner.user.email, ...mail }).catch((err) => console.error("[billing] backup-ended email", workspaceId, err));
}
