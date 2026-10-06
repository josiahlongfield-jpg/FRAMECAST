import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Logo from "@/components/Logo";
import WatchView from "@/components/WatchView";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { publicVideo } from "@/lib/videos";
import { BRAND } from "@/lib/brand";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const v = await db.video.findUnique({ where: { id }, select: { title: true, thumbnailUrl: true } });
  if (!v) return { title: "Video not found" };
  return {
    title: v.title,
    openGraph: { title: v.title, siteName: BRAND.name, images: v.thumbnailUrl ? [v.thumbnailUrl] : undefined, type: "video.other" },
  };
}

export default async function Watch({ params }: Props) {
  const { id } = await params;
  const [video, me] = await Promise.all([
    db.video.findUnique({ where: { id }, include: { owner: { select: { name: true, email: true } } } }),
    currentUser(),
  ]);
  if (!video) notFound();
  const expired = !!video.expiresAt && video.expiresAt < new Date();
  const comments = await db.comment.findMany({
    where: { videoId: id },
    orderBy: { createdAt: "asc" },
    include: { author: { select: { name: true, email: true } } },
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo href={me ? "/library" : "/"} />
          {!me && <a href="/record" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">Record your own, free</a>}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {expired ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-16 text-center text-slate-600">This link has expired.</p>
        ) : (
          <WatchView
            video={publicVideo(video)}
            ownerName={video.owner.name ?? video.owner.email.split("@")[0]}
            canEdit={me?.workspace.id === video.workspaceId}
            signedIn={!!me}
            initialComments={comments.map((c) => ({
              id: c.id,
              body: c.body,
              timestampMs: c.timestampMs,
              createdAt: c.createdAt.toISOString(),
              author: c.author.name ?? c.author.email.split("@")[0],
            }))}
          />
        )}
      </main>
    </div>
  );
}
