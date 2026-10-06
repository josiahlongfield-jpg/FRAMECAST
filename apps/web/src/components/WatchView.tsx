"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { REACTIONS } from "@/lib/reactions";
import type { ReplyDTO } from "@/lib/replies";
import { fixDuration } from "./MediaPlayer";
import MediaPlayer from "./MediaPlayer";
import ReplyComposer from "./ReplyComposer";
import { recoverInterrupted } from "@/lib/recorder/uploader";

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

const fmt = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export default function WatchView({
  video,
  ownerName,
  canEdit,
  signedIn,
  initialReplies,
}: {
  video: Video;
  ownerName: string;
  canEdit: boolean;
  signedIn: boolean;
  initialReplies: ReplyDTO[];
}) {
  const router = useRouter();
  const player = useRef<HTMLVideoElement>(null);
  const [title, setTitle] = useState(video.title);
  const [replies, setReplies] = useState(initialReplies);
  const listEnd = useRef<HTMLLIElement>(null);
  const [copied, setCopied] = useState(false);
  const [burst, setBurst] = useState<{ id: number; emoji: string }[]>([]);
  const viewed = useRef(false);

  // Prefer adaptive HLS once transcoded; otherwise play the raw upload immediately.
  useEffect(() => {
    const el = player.current;
    if (!el) return;
    if (!video.hlsUrl) {
      const undo = fixDuration(el);
      el.src = video.rawUrl;
      return undo;
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

  /**
   * The playback position to pin a reply or reaction to, or undefined when the
   * viewer hasn't reached a real moment yet (including the temporary far-seek
   * used to work out a WebM file's length).
   */
  function momentMs() {
    const el = player.current;
    if (!el || !Number.isFinite(el.duration) || el.currentTime < 0.5 || el.currentTime > el.duration) return undefined;
    return Math.round(el.currentTime * 1000);
  }

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
      body: JSON.stringify({ emoji, timestampMs: momentMs() }),
    });
  }

  // Finish sending any reply that a crash or closed tab interrupted.
  useEffect(() => {
    recoverInterrupted(async (_id, s) => {
      if (s.replyTo !== video.id) return;
      const res = await fetch(`/api/videos/${video.id}/replies`);
      if (res.ok) setReplies((await res.json()).replies);
    }).catch(() => {});
  }, [video.id]);

  // Keep the conversation fresh while the page is open.
  useEffect(() => {
    const t = setInterval(async () => {
      if (document.hidden) return;
      const res = await fetch(`/api/videos/${video.id}/replies`).catch(() => null);
      if (!res?.ok) return;
      const { replies } = (await res.json()) as { replies: ReplyDTO[] };
      setReplies((cur) => (replies.length !== cur.length ? replies : cur));
    }, 15_000);
    return () => clearInterval(t);
  }, [video.id]);

  function addReply(r: ReplyDTO) {
    setReplies((cur) => (cur.some((x) => x.id === r.id) ? cur : [...cur, r]));
    requestAnimationFrame(() => listEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
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

      <aside className="flex flex-col rounded-2xl border border-slate-200 bg-white lg:max-h-[calc(100vh-8rem)]">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-slate-900">Conversation</h2>
          <p className="text-xs text-slate-500">Reply with a video, a voice note or a message. No account needed.</p>
        </div>
        <ul className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm">
          {replies.length === 0 && <li className="text-slate-500">No replies yet. Be the first to respond.</li>}
          {replies.map((r) => (
            <li key={r.id} className={`flex flex-col ${r.fromOwner ? "items-start" : "items-end"}`}>
              <div className="mb-1 flex items-center gap-2 text-xs text-slate-500">
                <span className="font-medium text-slate-800">{r.authorName}</span>
                <span>{new Date(r.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
              </div>
              {r.kind === "TEXT" ? (
                <div className={`max-w-[90%] rounded-2xl px-3 py-2 ${r.fromOwner ? "rounded-tl-sm bg-slate-100 text-slate-800" : "rounded-tr-sm bg-brand-600 text-white"}`}>
                  {r.timestampMs !== null && (
                    <button
                      onClick={() => seek(r.timestampMs)}
                      className={`mr-1.5 rounded px-1.5 text-xs font-medium ${r.fromOwner ? "bg-white text-brand-700" : "bg-white/20 text-white"}`}
                    >
                      {fmt(r.timestampMs)}
                    </button>
                  )}
                  <span className="whitespace-pre-wrap">{r.body}</span>
                </div>
              ) : r.media ? (
                <div className="w-full max-w-[90%]">
                  <MediaPlayer src={r.media.url} kind={r.kind} />
                </div>
              ) : null}
            </li>
          ))}
          <li ref={listEnd} aria-hidden />
        </ul>
        <ReplyComposer
          videoId={video.id}
          signedIn={signedIn}
          currentTimeMs={momentMs}
          onReplied={addReply}
        />
      </aside>
    </div>
  );
}
