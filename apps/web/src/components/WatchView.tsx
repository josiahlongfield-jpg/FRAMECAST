"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { REACTIONS } from "@/lib/reactions";

type Video = {
  id: string;
  title: string;
  status: string;
  hlsUrl: string | null;
  rawUrl: string;
  durationMs: number | null;
  viewCount: number;
  createdAt: string;
};
type Comment = { id: string; body: string; timestampMs: number | null; createdAt: string; author: string };

const fmt = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export default function WatchView({
  video,
  ownerName,
  canEdit,
  signedIn,
  initialComments,
}: {
  video: Video;
  ownerName: string;
  canEdit: boolean;
  signedIn: boolean;
  initialComments: Comment[];
}) {
  const router = useRouter();
  const player = useRef<HTMLVideoElement>(null);
  const [title, setTitle] = useState(video.title);
  const [comments, setComments] = useState(initialComments);
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const [burst, setBurst] = useState<{ id: number; emoji: string }[]>([]);
  const viewed = useRef(false);

  // Prefer adaptive HLS once transcoded; otherwise play the raw upload immediately.
  useEffect(() => {
    const el = player.current;
    if (!el) return;
    if (!video.hlsUrl) {
      // Browser-recorded WebM has no duration in its header until transcoded.
      // Seeking far ahead makes the browser scan the file and learn it.
      const fixDuration = () => {
        if (el.duration !== Infinity) return;
        el.addEventListener("durationchange", () => (el.currentTime = 0), { once: true });
        el.currentTime = 1e101;
      };
      el.addEventListener("loadedmetadata", fixDuration, { once: true });
      el.src = video.rawUrl;
      return () => el.removeEventListener("loadedmetadata", fixDuration);
    }
    if (el.canPlayType("application/vnd.apple.mpegurl")) {
      el.src = video.hlsUrl;
      return;
    }
    let destroy = () => {};
    import("hls.js").then(({ default: Hls }) => {
      if (!Hls.isSupported()) {
        el.src = video.rawUrl;
        return;
      }
      const hls = new Hls();
      hls.loadSource(video.hlsUrl!);
      hls.attachMedia(el);
      hls.on(Hls.Events.ERROR, (_e, d) => {
        if (d.fatal) {
          hls.destroy();
          el.src = video.rawUrl;
        }
      });
      destroy = () => hls.destroy();
    });
    return () => destroy();
  }, [video.hlsUrl, video.rawUrl]);

  function onPlay() {
    if (viewed.current) return;
    viewed.current = true;
    void fetch(`/api/videos/${video.id}/view`, { method: "POST" });
  }

  async function react(emoji: string) {
    const id = Date.now() + Math.random();
    setBurst((b) => [...b, { id, emoji }]);
    setTimeout(() => setBurst((b) => b.filter((x) => x.id !== id)), 1200);
    await fetch(`/api/videos/${video.id}/reactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emoji, timestampMs: Math.round((player.current?.currentTime ?? 0) * 1000) }),
    });
  }

  async function comment(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    const res = await fetch(`/api/videos/${video.id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: draft, timestampMs: Math.round((player.current?.currentTime ?? 0) * 1000) }),
    });
    if (res.ok) {
      const { comment } = await res.json();
      setComments((c) => [...c, comment]);
      setDraft("");
    }
  }

  async function saveTitle() {
    if (title.trim() && title !== video.title) {
      await fetch(`/api/videos/${video.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
    }
  }

  async function remove() {
    if (!confirm("Delete this video? This can't be undone.")) return;
    await fetch(`/api/videos/${video.id}`, { method: "DELETE" });
    router.push("/library");
  }

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.origin + `/v/${video.id}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const seek = (ms: number | null) => {
    if (ms === null || !player.current) return;
    player.current.currentTime = ms / 1000;
    void player.current.play();
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <section>
        <div className="relative overflow-hidden rounded-2xl bg-black shadow-sm">
          {video.status === "RECORDING" ? (
            <div className="grid aspect-video place-items-center text-slate-300">This recording is still uploading. Refresh in a moment.</div>
          ) : (
            <video ref={player} controls playsInline onPlay={onPlay} className="aspect-video w-full bg-black" />
          )}
          <div className="pointer-events-none absolute bottom-16 right-6 flex flex-col items-center">
            {burst.map((b) => (
              <span key={b.id} className="animate-[float_1.2s_ease-out_forwards] text-4xl">{b.emoji}</span>
            ))}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            {canEdit ? (
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={saveTitle}
                aria-label="Video title"
                className="w-full rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-2xl font-semibold text-slate-900 hover:border-slate-200 focus:border-brand-600 focus:outline-none"
              />
            ) : (
              <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
            )}
            <p className="mt-1 px-1 text-sm text-slate-500">
              {ownerName} · {new Date(video.createdAt).toLocaleDateString("en-US", { dateStyle: "medium" })} · {video.viewCount} views
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={copyLink} className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
              {copied ? "Link copied" : "Copy link"}
            </button>
            {canEdit && (
              <button onClick={remove} className="rounded-xl border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100">Delete</button>
            )}
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          {REACTIONS.map((e) => (
            <button key={e} onClick={() => react(e)} aria-label={`React ${e}`} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-lg hover:bg-slate-100">
              {e}
            </button>
          ))}
        </div>
      </section>

      <aside className="flex flex-col rounded-2xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-100 px-5 py-4 font-semibold text-slate-900">Comments</h2>
        <ul className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm lg:max-h-[480px]">
          {comments.length === 0 && <li className="text-slate-500">No comments yet.</li>}
          {comments.map((c) => (
            <li key={c.id}>
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-900">{c.author}</span>
                {c.timestampMs !== null && (
                  <button onClick={() => seek(c.timestampMs)} className="rounded bg-brand-50 px-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100">
                    {fmt(c.timestampMs)}
                  </button>
                )}
              </div>
              <p className="mt-0.5 whitespace-pre-wrap text-slate-700">{c.body}</p>
            </li>
          ))}
        </ul>
        {signedIn ? (
          <form onSubmit={comment} className="border-t border-slate-100 p-4">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Add a comment at the current moment…"
              rows={2}
              className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none"
            />
            <button className="mt-2 w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">Comment</button>
          </form>
        ) : (
          <p className="border-t border-slate-100 p-4 text-sm text-slate-500">
            <a href={`/login?next=/v/${video.id}`} className="font-medium text-brand-700 hover:underline">Sign in</a> to comment.
          </p>
        )}
      </aside>
    </div>
  );
}
