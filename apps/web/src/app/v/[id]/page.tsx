import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Logo from "@/components/Logo";
import AppHeader from "@/components/AppHeader";
import BrandMark from "@/components/BrandMark";
import MadeWith from "@/components/MadeWith";
import { brandOf, brandStyle } from "@/lib/branding";
import WatchView from "@/components/WatchView";
import SureFramePromo from "@/components/SureFramePromo";
import { aiAssistActive, PLANS } from "@/lib/plans";
import { db } from "@/lib/db";
import { viewerFor } from "@/lib/access";
import { clientLink } from "@/lib/clients";
import { publicVideo } from "@/lib/videos";
import { replyDTO, visibleReplies } from "@/lib/replies";
import { canDeleteVideo, clientScopeWhere, effectivePerms } from "@/lib/permissions";

type Props = { params: Promise<{ id: string }> };

async function load(id: string) {
  const video = await db.video.findUnique({ where: { id }, include: { owner: { select: { name: true, email: true } } } });
  if (!video || video.replyToId) return null;
  return { video, viewer: await viewerFor(video) };
}

// Titles and thumbnails are never put in link previews: videos are private.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const found = await load(id);
  return { title: found?.viewer ? found.video.title : "Private video", robots: { index: false } };
}

export default async function Watch({ params }: Props) {
  const { id } = await params;
  const found = await load(id);
  if (!found) notFound();
  const { video, viewer } = found;

  if (!viewer) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 px-4">
        <div className="max-w-sm rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <Logo />
          <h1 className="mt-6 text-lg font-semibold text-slate-900">This video is private</h1>
          <p className="mt-2 text-sm text-slate-600">
            Open it from the personal link you were sent, or sign in if it&apos;s yours.
          </p>
          <Link href={`/login?next=/v/${id}`} className="mt-6 inline-block text-sm font-medium text-brand-700 hover:underline">
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  const isMember = viewer.kind === "member";
  const access = viewer.kind === "member" ? viewer.access : null;
  const perms = access ? effectivePerms(access) : null;
  const [replies, clients, staff, copies] = await Promise.all([
    db.reply.findMany({ where: { videoId: id, ...visibleReplies }, orderBy: { createdAt: "asc" }, include: { media: true } }),
    // Only the clients this person may see (lib/permissions.ts).
    access ? db.client.findMany({ where: { ...clientScopeWhere(access), removedAt: null }, orderBy: { name: "asc" } }) : Promise.resolve([]),
    // Quick picks by staff member only help someone who can see everyone's clients.
    access && perms?.seeAllClients ? db.membership.findMany({ where: { workspaceId: video.workspaceId }, include: { user: true }, orderBy: { id: "asc" } }) : Promise.resolve([]),
    // The other clients this recording went to, each with their own conversation.
    access && !video.sourceId ? db.video.findMany({ where: { sourceId: video.id, client: clientScopeWhere(access) }, select: { id: true, clientId: true }, orderBy: { createdAt: "asc" } }) : Promise.resolve([]),
  ]);
  // Staff can open a video they recorded that went to someone else's client: show who, nothing more.
  const recipient = access && video.clientId && !clients.some((c) => c.id === video.clientId)
    ? await db.client.findUnique({ where: { id: video.clientId }, select: { id: true, name: true } })
    : null;
  const expired = !!video.expiresAt && video.expiresAt < new Date();
  const workspace = await db.workspace.findUniqueOrThrow({ where: { id: video.workspaceId } });
  // AI summaries add-on. Copies sent to other clients share the original recording's transcript.
  const aiOn = aiAssistActive(workspace);
  const insight = await db.videoInsight.findUnique({ where: { videoId: video.sourceId ?? video.id }, select: { transcript: true, summary: true } });
  // Clients see the business's branding; the team sees the normal app.
  const brand = isMember ? null : brandOf(workspace);
  const memberEmail = viewer.kind === "member" ? (await db.user.findUnique({ where: { id: viewer.userId }, select: { email: true } }))?.email : null;

  return (
    <div className="min-h-screen bg-slate-50" style={brandStyle(brand?.color ?? null)}>
      {isMember ? (
        // The team gets the normal app menu, so they can get back to the Library and everything else.
        <AppHeader email={memberEmail ?? ""} plan={PLANS[workspace.plan].name} />
      ) : (
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
            <BrandMark brand={brand} href="/inbox" />
            <Link href="/inbox" className="shrink-0 text-sm font-medium text-slate-600 hover:text-slate-900">
              All my videos
            </Link>
          </div>
        </header>
      )}
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {expired ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-16 text-center text-slate-600">This link has expired.</p>
        ) : (
          <>
          {!isMember && PLANS[workspace.plan].showsPromo && <SureFramePromo videoId={video.id} />}
          <WatchView
            video={publicVideo(video)}
            ownerName={
              // Clients see "Sam from Business" (never an email); the team sees the name or email.
              isMember ? (video.owner.name ?? video.owner.email.split("@")[0]) : video.owner.name ? `${video.owner.name} from ${workspace.name}` : workspace.name
            }
            canDelete={!!access && canDeleteVideo(access, video)}
            viewer={
              viewer.kind === "member"
                ? { kind: "member", workspaceId: video.workspaceId, fingerprint: workspace.keyFingerprint }
                : { kind: "client", clientId: viewer.client.id }
            }
            clients={[
              ...clients.map((c) => ({ id: c.id, name: c.name, link: clientLink(c.token, video.id), teamKeyWrap: c.teamKeyWrap, assignedToId: c.assignedToId })),
              ...(recipient ? [{ id: recipient.id, name: recipient.name, link: "", teamKeyWrap: null, assignedToId: null }] : []),
            ]}
            sendMany={
              viewer.kind === "member" && perms?.sendToMany
                ? {
                    meId: viewer.userId,
                    sourceId: video.sourceId,
                    staff: staff.map((m) => ({ id: m.userId, name: m.user.name ?? m.user.email.split("@")[0] })),
                    copies: copies.filter((c) => c.clientId).map((c) => ({ id: c.id, clientId: c.clientId! })),
                  }
                : undefined
            }
            sentToId={video.clientId}
            ai={aiOn || insight ? { insight, canMake: isMember && aiOn, notice: !isMember } : undefined}
            initialReplies={replies.map((r) => replyDTO(r, video.ownerId))}
          />
          </>
        )}
      </main>
      {!isMember && <MadeWith />}
    </div>
  );
}
