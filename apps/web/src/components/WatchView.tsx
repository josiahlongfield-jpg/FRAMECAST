"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { REACTIONS } from "@/lib/reactions";
import type { ReplyDTO } from "@/lib/replies";
import { fixDuration } from "./MediaPlayer";
import ReplyComposer from "./ReplyComposer";
import SecureMedia, { useDecryptedUrl } from "./SecureMedia";
import TeamKeyGate from "./TeamKeyGate";
import { personalLink } from "./ClientsManager";
import { recoverInterrupted } from "@/lib/recorder/uploader";
import { decryptText, importKey, unwrapKey, wrapKey } from "@/lib/e2e/crypto";
import { clientKeyName, loadKey, saveKey } from "@/lib/e2e/keystore";

type Video = {
  id: string;
  title: string;
  status: string;
  mimeType: string;
  rawUrl: string;
  durationMs: number | null;
  viewCount: number;
  createdAt: string;
  encrypted: boolean;
  teamKeyWrap: string | null;
  clientKeyWrap: string | null;
  purgeAt: string | null;
};

type ClientOption = { id: string; name: string; link: string; teamKeyWrap: string | null };

export type WatchViewer = { kind: "member"; workspaceId: string; fingerprint: string | null } | { kind: "client"; clientId: string };

type Props = {
  video: Video;
  viewer: WatchViewer;
  ownerName: string;
  /** Members only: clients this video can be sent to. */
  clients: ClientOption[];
  sentToId: string | null;
  initialReplies: ReplyDTO[];
};

/**
 * Unlocks the conversation on this device before showing it. Team members
 * use the team key; a client uses the key that arrived in their personal
 * link's #fragment (saved on this device the first time they open it).
 */
export default function WatchView(props: Props) {
  if (props.viewer.kind === "member") {
    return (
      <TeamKeyGate workspaceId={props.viewer.workspaceId} fingerprint={props.viewer.fingerprint}>
        {(teamKey) => <MemberUnlock {...props} teamKey={teamKey} />}
      </TeamKeyGate>
    );
  }
  return <ClientUnlock {...props} clientId={props.viewer.clientId} />;
}

function MemberUnlock({ teamKey, ...props }: Props & { teamKey: CryptoKey }) {
  const [rootKey, setRootKey] = useState<CryptoKey | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!props.video.teamKeyWrap) return setFailed(true);
    unwrapKey(props.video.teamKeyWrap, teamKey).then(setRootKey, () => setFailed(true));
  }, [props.video.teamKeyWrap, teamKey]);
  if (failed) return <Locked text="This video was locked with a different key and can't be opened on this device." />;
  if (!rootKey) return <Locked text="Unlocking…" />;
  return <WatchBody {...props} canEdit rootKey={rootKey} teamKey={teamKey} />;
}

function ClientUnlock({ clientId, ...props }: Props & { clientId: string }) {
  const [rootKey, setRootKey] = useState<CryptoKey | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    (async () => {
      // Arriving from a personal link: keep the key on this device, then hide it from the address bar.
      const fromLink = new URLSearchParams(window.location.hash.slice(1)).get("k");
      if (fromLink) {
        try {
          await saveKey(clientKeyName(clientId), await importKey(fromLink));
        } catch {
          /* malformed link; fall through to the stored key */
        }
        history.replaceState(null, "", window.location.pathname + window.location.search);
      }
      const clientKey = await loadKey(clientKeyName(clientId));
      if (!clientKey || !props.video.clientKeyWrap) return setMissing(true);
      setRootKey(await unwrapKey(props.video.clientKeyWrap, clientKey));
    })().catch(() => setMissing(true));
  }, [clientId, props.video.clientKeyWrap]);
  if (missing) return <Locked text="Open this video from the personal link you were sent to unlock it on this device." />;
  if (!rootKey) return <Locked text="Unlocking…" />;
  return <WatchBody {...props} canEdit={false} rootKey={rootKey} />;
}

function Locked({ text }: { text: string }) {
  return <p className="rounded-2xl border border-slate-200 bg-white p-16 text-center text-slate-600">{text}</p>;
}

const fmt = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function WatchBody({
  video,
  ownerName,
  canEdit,
  clients,
  sentToId,
  initialReplies,
  rootKey,
  teamKey,
}: Props & { canEdit: boolean; rootKey: CryptoKey; teamKey?: CryptoKey }) {
  const router = useRouter();
  const player = useRef<HTMLVideoElement>(null);
  const [title, setTitle] = useState(video.title);
  const [replies, setReplies] = useState(initialReplies);
  const listEnd = useRef<HTMLLIElement>(null);
  const [copied, setCopied] = useState(false);
  const [burst, setBurst] = useState<{ id: number; emoji: string }[]>([]);
  const viewed = useRef(false);

  // Encrypted recordings are downloaded and decrypted here, on the viewer's device.
  const expired = video.status === "EXPIRED";
  const { src, error: playError } = useDecryptedUrl(
    video.status === "RECORDING" || expired ? null : video.rawUrl,
    video.encrypted ? rootKey : null,
    video.mimeType,
  );
  const playable = video.encrypted ? src : video.rawUrl;
  useEffect(() => {
    const el = player.current;
    if (!el || !playable) return;
    const undo = fixDuration(el);
    el.src = playable;
    return undo;
  }, [playable]);

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

  const [sentTo, setSentTo] = useState(sentToId);
  const recipient = clients.find((c) => c.id === sentTo);

  async function sendTo(clientId: string | null) {
    if (!teamKey) return;
    const client = clients.find((c) => c.id === clientId);
    // Give the client this video's key, locked with their own key, so only they (and the team) can open it.
    const clientKeyWrap = client?.teamKeyWrap ? await wrapKey(rootKey, await unwrapKey(client.teamKeyWrap, teamKey)) : undefined;
    setSentTo(clientId);
    await fetch(`/api/videos/${video.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, clientKeyWrap }),
    });
  }

  async function copyLink() {
    if (!recipient || !teamKey) return;
    const link = await personalLink(recipient.link, recipient.teamKeyWrap, teamKey);
    await navigator.clipboard.writeText(link);
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
          ) : expired ? (
            <div className="grid aspect-video place-items-center px-6 text-center text-slate-300">
              This copy has expired from our servers. The original is saved on the sender&apos;s device.
            </div>
          ) : playError ? (
            <div className="grid aspect-video place-items-center text-slate-300">Couldn&apos;t unlock this recording on this device.</div>
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
            {canEdit && recipient && (
              <button onClick={copyLink} className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
                {copied ? "Link copied" : `Copy ${recipient.name.split(" ")[0]}'s link`}
              </button>
            )}
            {playable && (
              <a
                href={playable}
                download={`${title.replace(/[^\w\- ]+/g, "").trim() || "recording"}.${video.mimeType.includes("mp4") ? "mp4" : "webm"}`}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
              >
                Save to device
              </a>
            )}
            {canEdit && (
              <button onClick={remove} className="rounded-xl border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100">Delete</button>
            )}
          </div>
        </div>

        {video.purgeAt && !expired && (
          <p className="mt-3 flex items-center gap-2 px-1 text-xs text-slate-500">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
            End-to-end encrypted. Our encrypted copy is deleted on{" "}
            {new Date(video.purgeAt).toLocaleDateString("en-US", { dateStyle: "medium" })}. Save it to your device to keep it.
          </p>
        )}

        {canEdit && (
          <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
            <label className="flex flex-wrap items-center gap-3 text-sm">
              <span className="font-medium text-slate-900">Send to</span>
              <select
                value={sentTo ?? ""}
                onChange={(e) => sendTo(e.target.value || null)}
                className="min-w-48 rounded-lg border border-slate-300 bg-white px-3 py-2"
              >
                <option value="">Only my team (private)</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {clients.length === 0 && (
                <Link href="/clients" className="text-brand-700 hover:underline">Add a client first</Link>
              )}
            </label>
            <p className="mt-2 text-xs text-slate-500">
              {recipient
                ? `Only your team and ${recipient.name} can watch this. Send them their personal link.`
                : "Nobody outside your team can watch this until you send it to a client."}
            </p>
          </div>
        )}

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
          <p className="text-xs text-slate-500">Reply with a video, a voice note or a message. End-to-end encrypted.</p>
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
                  <ReplyText reply={r} conversationKey={rootKey} />
                </div>
              ) : r.media ? (
                <div className="w-full max-w-[90%]">
                  <ReplyMedia reply={r} conversationKey={rootKey} />
                </div>
              ) : null}
            </li>
          ))}
          <li ref={listEnd} aria-hidden />
        </ul>
        <ReplyComposer
          videoId={video.id}
          conversationKey={rootKey}
          currentTimeMs={momentMs}
          onReplied={addReply}
        />
      </aside>
    </div>
  );
}

function ReplyText({ reply, conversationKey }: { reply: ReplyDTO; conversationKey: CryptoKey }) {
  const [text, setText] = useState<string | null>(reply.encrypted ? null : reply.body);
  useEffect(() => {
    if (!reply.encrypted || !reply.body) return;
    decryptText(reply.body, conversationKey).then(setText, () => setText("[Couldn't unlock this message]"));
  }, [reply.body, reply.encrypted, conversationKey]);
  return <span className="whitespace-pre-wrap">{text ?? "…"}</span>;
}

function ReplyMedia({ reply, conversationKey }: { reply: ReplyDTO; conversationKey: CryptoKey }) {
  const [key, setKey] = useState<CryptoKey | null>(null);
  const media = reply.media!;
  useEffect(() => {
    if (media.parentKeyWrap) unwrapKey(media.parentKeyWrap, conversationKey).then(setKey, () => setKey(null));
  }, [media.parentKeyWrap, conversationKey]);
  if (media.expired) {
    return <p className="rounded-lg bg-slate-100 px-3 py-3 text-xs text-slate-500">This reply has expired from our servers.</p>;
  }
  return <SecureMedia url={media.url} mediaKey={key} mimeType={media.mimeType} kind={reply.kind === "AUDIO" ? "AUDIO" : "VIDEO"} />;
}
