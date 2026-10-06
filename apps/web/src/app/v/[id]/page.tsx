import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Logo from "@/components/Logo";
import WatchView from "@/components/WatchView";
import { db } from "@/lib/db";
import { viewerFor } from "@/lib/access";
import { clientLink } from "@/lib/clients";
import { publicVideo } from "@/lib/videos";
import { replyDTO, visibleReplies } from "@/lib/replies";

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
  const [replies, clients] = await Promise.all([
    db.reply.findMany({ where: { videoId: id, ...visibleReplies }, orderBy: { createdAt: "asc" }, include: { media: true } }),
    isMember
      ? db.client.findMany({ where: { workspaceId: video.workspaceId, removedAt: null }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
  ]);
  const expired = !!video.expiresAt && video.expiresAt < new Date();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo href={isMember ? "/library" : "/inbox"} />
          {!isMember && (
            <Link href="/inbox" className="text-sm font-medium text-slate-600 hover:text-slate-900">
              All my videos
            </Link>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {expired ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-16 text-center text-slate-600">This link has expired.</p>
        ) : (
          <WatchView
            video={publicVideo(video)}
            ownerName={video.owner.name ?? video.owner.email.split("@")[0]}
            viewer={
              viewer.kind === "member"
                ? { kind: "member", workspaceId: video.workspaceId, fingerprint: (await db.workspace.findUniqueOrThrow({ where: { id: video.workspaceId } })).keyFingerprint }
                : { kind: "client", clientId: viewer.client.id }
            }
            clients={clients.map((c) => ({ id: c.id, name: c.name, link: clientLink(c.token, video.id), teamKeyWrap: c.teamKeyWrap }))}
            sentToId={video.clientId}
            initialReplies={replies.map((r) => replyDTO(r, video.ownerId))}
          />
        )}
      </main>
    </div>
  );
}
