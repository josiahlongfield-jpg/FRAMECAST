"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { REACTIONS } from "@/lib/reactions";
import type { ReplyDTO } from "@/lib/replies";
import { fixDuration } from "./MediaPlayer";
import ReplyComposer from "./ReplyComposer";
import SecureMedia, { useDecryptedUrl } from "./SecureMedia";
import TeamKeyGate from "./TeamKeyGate";
import AiInsight, { type SealedInsight } from "./AiInsight";
import AiNotice from "./AiNotice";
import { personalLink } from "./ClientsManager";
import { recoverInterrupted } from "@/lib/recorder/uploader";
import { decryptText, importKey, unwrapKey, wrapKey, fingerprint } from "@/lib/e2e/crypto";
import { clientKeyName, loadClientKey, saveKey } from "@/lib/e2e/keystore";

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

type ClientOption = {
  id: string;
  name: string;
  link: string;
  teamKeyWrap: string | null;
  assignedToId?: string | null;
  /** The client has opened their personal link on some device, so emails about new videos work. */
  linkOpened?: boolean;
  /** Has an email address and hasn't turned emails off. */
  emailable?: boolean;
  /** For a copy sent to another client: that client's own conversation. */
  copyId?: string;
};

/** Members only: what's needed to send this recording to several clients at once. */
type SendMany = {
  meId: string;
  /** Set when this page is one client's copy of another video. */
  sourceId: string | null;
  staff: { id: string; name: string }[];
  /** Copies already sent to other clients. */
  copies: { id: string; clientId: string }[];
};

export type WatchViewer = { kind: "member"; workspaceId: string; fingerprint: string | null } | { kind: "client"; clientId: string };

type Props = {
  video: Video;
  viewer: WatchViewer;
  ownerName: string;
  /** Members only: may delete this video (staff can be limited to their own recordings). */
  canDelete?: boolean;
  /** Members only: clients this video can be sent to. */
  clients: ClientOption[];
  sentToId: string | null;
  initialReplies: ReplyDTO[];
  sendMany?: SendMany;
  /** AI summaries add-on: the encrypted transcript/summary, whether this viewer may make one, and whether to tell a client AI is used. */
  ai?: { insight: SealedInsight; canMake: boolean; notice: boolean };
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
      const clientKey = await loadClientKey(clientId);
      if (!clientKey || !props.video.clientKeyWrap) return setMissing(true);
      void markLinkOpened(clientId);
      setRootKey(await unwrapKey(props.video.clientKeyWrap, clientKey));
    })().catch(() => setMissing(true));
  }, [clientId, props.video.clientKeyWrap]);
  if (missing) return <Locked text="Open this video from the personal link you were sent to unlock it on this device." />;
  if (!rootKey) return <Locked text="Unlocking…" />;
  return <WatchBody {...props} canEdit={false} rootKey={rootKey} />;
}

/**
 * Shown when a video goes to a client who hasn't opened their personal link
 * yet. Their key only exists on the team's devices, so we can't email it:
 * the business sends the link once, then new videos are emailed for them.
 */
function FirstLinkDialog({ clients, videoId, teamKey, onClose }: { clients: ClientOption[]; videoId: string; teamKey: CryptoKey; onClose: () => void }) {
  const [copied, setCopied] = useState<string>();
  const one = clients.length === 1 ? clients[0] : null;
  const first = (n: string) => n.split(" ")[0];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);

  async function copy(c: ClientOption) {
    const url = new URL(c.link);
    url.searchParams.set("v", c.copyId ?? videoId);
    await navigator.clipboard.writeText(await personalLink(url.toString(), c.teamKeyWrap, teamKey));
    setCopied(c.id);
    setTimeout(() => setCopied(undefined), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="first-link-title"
        data-testid="first-link-dialog"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
      >
        <h2 id="first-link-title" className="text-lg font-semibold text-slate-900">
          {one ? `Send ${first(one.name)} their personal link` : "Send these clients their personal links"}
        </h2>
        <div className="mt-3 space-y-3 text-sm text-slate-600">
          <p>
            {one ? `${one.name} hasn't opened their personal link yet` : "These clients haven't opened their personal links yet"}, so this first time it&apos;s up to you to send it, by email, text or any message app.
          </p>
          <p>
            Why: your videos are end-to-end encrypted. Each client&apos;s link holds their private key, and only your team&apos;s devices have it, so we can&apos;t email it for you without being able to see their videos.
          </p>
          <p>Once they open it, that phone or computer remembers it. From then on we email them each new video automatically, if they have an email address saved.</p>
        </div>
        <ul className="mt-4 grid gap-2">
          {clients.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3">
              {!one && <span className="text-sm text-slate-800">{c.name}</span>}
              <button
                onClick={() => copy(c)}
                className={`${one ? "w-full" : ""} rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700`}
              >
                {copied === c.id ? "Link copied" : `Copy ${first(c.name)}'s link`}
              </button>
            </li>
          ))}
        </ul>
        <button onClick={onClose} className="mt-3 w-full rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Done
        </button>
      </div>
    </div>
  );
}

/** Lets the business know this client has their personal link working (see api/clients/[id]/opened). */
function markLinkOpened(clientId: string) {
  return fetch(`/api/clients/${clientId}/opened`, { method: "POST" }).catch(() => {});
}

function Locked({ text }: { text: string }) {
  return <p className="rounded-2xl border border-slate-200 bg-white p-16 text-center text-slate-600">{text}</p>;
}

/** Statuses where the recording is fully uploaded and safe on the server. */
const UPLOAD_DONE = new Set(["UPLOADED", "PROCESSING", "READY"]);

const fmt = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function WatchBody({
  video,
  ownerName,
  canEdit,
  canDelete,
  clients,
  sentToId,
  initialReplies,
  sendMany,
  ai,
  rootKey,
  teamKey,
}: Props & { canEdit: boolean; rootKey: CryptoKey; teamKey?: CryptoKey }) {
  const router = useRouter();
  const player = useRef<HTMLVideoElement>(null);
  const [title, setTitle] = useState(video.title);
  const [replies, setReplies] = useState(initialReplies);
  const listEnd = useRef<HTMLLIElement>(null);
  const reactionsRow = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const [expanded, setExpanded] = useState(false);

  // On wide screens the conversation panel ends level with the reactions row,
  // so a long transcript or summary below the video doesn't stretch it.
  useLayoutEffect(() => {
    const row = reactionsRow.current;
    const aside = panel.current;
    if (!row || !aside) return;
    const wide = window.matchMedia("(min-width: 1024px)");
    const fit = () => {
      if (!wide.matches || aside.dataset.expanded) return void (aside.style.height = "");
      const height = row.getBoundingClientRect().bottom - aside.getBoundingClientRect().top;
      aside.style.height = `${Math.max(420, Math.round(height))}px`;
    };
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(row.parentElement ?? row);
    wide.addEventListener("change", fit);
    window.addEventListener("resize", fit);
    return () => {
      watch.disconnect();
      wide.removeEventListener("change", fit);
      window.removeEventListener("resize", fit);
    };
  }, [expanded]);

  // The larger view closes with Escape.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setExpanded(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);
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
    const others = sendMany && !sendMany.sourceId && sendMany.copies.length ? " The copies sent to other clients are deleted too." : "";
    if (!confirm(`Delete this video?${others} This can't be undone.`)) return;
    await fetch(`/api/videos/${video.id}`, { method: "DELETE" });
    router.push("/library");
  }

  const [sentTo, setSentTo] = useState(sentToId);
  const recipient = clients.find((c) => c.id === sentTo);
  const [emailed, setEmailed] = useState<"sent" | "when-ready" | null>(null);
  const [firstLink, setFirstLink] = useState<ClientOption[] | null>(null);

  async function sendTo(clientId: string | null) {
    if (!teamKey) return;
    const client = clients.find((c) => c.id === clientId);
    // Give the client this video's key, locked with their own key, so only they (and the team) can open it.
    const clientKeyWrap = client?.teamKeyWrap ? await wrapKey(rootKey, await unwrapKey(client.teamKeyWrap, teamKey)) : undefined;
    setSentTo(clientId);
    setEmailed(null);
    // First video for a client who hasn't opened their personal link yet: explain why it's on them to send it.
    if (client && !client.linkOpened) setFirstLink([client]);
    const res = await fetch(`/api/videos/${video.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, clientKeyWrap, keyFingerprint: await fingerprint(teamKey), notify: true }),
    });
    const data = await res.json().catch(() => ({}));
    setEmailed(data.emailed ?? null);
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

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0 sm:flex-1">
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
          <div className="flex flex-wrap gap-2 sm:shrink-0">
            {canEdit && recipient?.link && (
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
            {canEdit && canDelete && (
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

        {canEdit && sendMany?.sourceId && (
          <p className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
            This is {recipient?.name ?? "a client"}&apos;s own conversation about this recording.{" "}
            <Link href={`/v/${sendMany.sourceId}`} className="font-medium text-brand-700 hover:underline">See the original</Link>
          </p>
        )}
        {canEdit && !sendMany?.sourceId && (
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
            <p className="mt-2 text-xs text-slate-500" data-testid="send-status">
              {!recipient
                ? "Nobody outside your team can watch this until you send it to a client."
                : !recipient.linkOpened
                  ? <>Only your team and {recipient.name} can watch this. {recipient.name} hasn&apos;t opened their personal link yet, so send it to them yourself this first time.{" "}
                      <button type="button" onClick={() => setFirstLink([recipient])} className="font-medium text-brand-700 hover:underline">Why?</button></>
                  : emailed === "sent"
                    ? `Only your team and ${recipient.name} can watch this. We've emailed ${recipient.name} to say it's waiting.`
                    : emailed === "when-ready"
                      ? `Only your team and ${recipient.name} can watch this. We'll email ${recipient.name} as soon as the upload finishes.`
                      : recipient.emailable
                        ? `Only your team and ${recipient.name} can watch this.`
                        : `Only your team and ${recipient.name} can watch this. ${recipient.name} has no email address saved, so send them the link yourself.`}
            </p>
            {sendMany && teamKey && video.encrypted && video.status !== "RECORDING" && (
              <SendToMany videoId={video.id} clients={clients} primaryId={sentTo} sendMany={sendMany} rootKey={rootKey} teamKey={teamKey} onFirstLink={setFirstLink} />
            )}
          </div>
        )}
        {firstLink && teamKey && (
          <FirstLinkDialog clients={firstLink} videoId={video.id} teamKey={teamKey} onClose={() => setFirstLink(null)} />
        )}

        <div ref={reactionsRow} className="mt-4 flex gap-2">
          {REACTIONS.map((e) => (
            <button key={e} onClick={() => react(e)} aria-label={`React ${e}`} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-lg hover:bg-slate-100">
              {e}
            </button>
          ))}
        </div>

        {ai && !expired && (
          <AiInsight
            videoId={video.id}
            rootKey={rootKey}
            initial={ai.insight}
            // Only once the upload has fully finished, so it never competes with the recording.
            canMake={ai.canMake && canEdit && UPLOAD_DONE.has(video.status)}
            mediaUrl={playable || null}
            durationMs={video.durationMs}
            canRemove={canEdit}
            onSeek={seek}
          />
        )}
        {ai?.notice && !canEdit && <AiNotice className="mt-4" />}
      </section>

      {expanded && <div className="fixed inset-0 z-40 bg-slate-900/50" onClick={() => setExpanded(false)} aria-hidden />}
      <aside
        ref={panel}
        data-testid="conversation"
        data-expanded={expanded || undefined}
        role={expanded ? "dialog" : undefined}
        aria-modal={expanded || undefined}
        aria-label={expanded ? "Conversation" : undefined}
        className={
          expanded
            ? "fixed inset-x-4 inset-y-6 z-50 mx-auto flex max-w-3xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl"
            : "flex max-h-[80vh] flex-col self-start rounded-2xl border border-slate-200 bg-white lg:max-h-none"
        }
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="font-semibold text-slate-900">Conversation</h2>
            <p className="text-xs text-slate-500">Reply with a video, a voice note or a message. End-to-end encrypted.</p>
          </div>
          <button
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "Close larger view" : "Open conversation in a larger view"}
            title={expanded ? "Close" : "Expand"}
            className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            {expanded ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>
            )}
          </button>
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

/**
 * Send this recording to several clients at once. Each gets their own copy
 * and a private conversation; quick picks select everyone, your own clients,
 * or the clients a staff member looks after.
 */
function SendToMany({
  videoId,
  clients,
  primaryId,
  sendMany,
  rootKey,
  teamKey,
  onFirstLink,
}: {
  videoId: string;
  clients: ClientOption[];
  primaryId: string | null;
  sendMany: SendMany;
  rootKey: CryptoKey;
  teamKey: CryptoKey;
  onFirstLink: (clients: ClientOption[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [copies, setCopies] = useState(sendMany.copies);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string>();
  const [copied, setCopied] = useState<string>();
  const has = new Set([primaryId, ...copies.map((c) => c.clientId)].filter(Boolean));
  const available = clients.filter((c) => !has.has(c.id));
  const team = sendMany.staff.length > 1;
  const name = (id: string) => clients.find((c) => c.id === id)?.name ?? "Client";
  const pick = (ids: string[]) => setPicked(new Set(ids.filter((id) => !has.has(id))));
  const toggle = (id: string) => setPicked((cur) => { const next = new Set(cur); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  async function send() {
    setBusy(true);
    setNote(undefined);
    try {
      // Each client's copy of this video's key, wrapped with their own key here on this device.
      const recipients = await Promise.all(
        clients.filter((c) => picked.has(c.id) && c.teamKeyWrap).map(async (c) => ({ clientId: c.id, clientKeyWrap: await wrapKey(rootKey, await unwrapKey(c.teamKeyWrap!, teamKey)) })),
      );
      const res = await fetch(`/api/videos/${videoId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipients, notify, keyFingerprint: await fingerprint(teamKey) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not send");
      setCopies((cur) => [...cur, ...data.sent]);
      setPicked(new Set());
      // Clients who haven't opened their personal link yet need it from you first.
      const sent = data.sent as { id: string; clientId: string }[];
      const firstTimers = clients.filter((c) => !c.linkOpened && sent.some((x) => x.clientId === c.id)).map((c) => ({ ...c, copyId: sent.find((x) => x.clientId === c.id)!.id }));
      if (firstTimers.length) onFirstLink(firstTimers);
      setNote(`Sent to ${data.sent.length} ${data.sent.length === 1 ? "client" : "clients"}${data.emailed ? `, ${data.emailed} emailed` : ""}.`);
    } catch (err) {
      setNote((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copyLink(copy: { id: string; clientId: string }) {
    const c = clients.find((x) => x.id === copy.clientId);
    if (!c) return;
    const url = new URL(c.link);
    url.searchParams.set("v", copy.id);
    await navigator.clipboard.writeText(await personalLink(url.toString(), c.teamKeyWrap, teamKey));
    setCopied(copy.id);
    setTimeout(() => setCopied(undefined), 2000);
  }

  return (
    <div className="mt-4 border-t border-slate-100 pt-4 text-sm">
      {copies.length > 0 && (
        <div className="mb-3">
          <p className="font-medium text-slate-900">Also sent to</p>
          <ul className="mt-2 grid gap-1.5" data-testid="sent-copies">
            {copies.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`/v/${c.id}`} className="text-slate-800 hover:text-brand-700 hover:underline">{name(c.clientId)}</Link>
                <button onClick={() => copyLink(c)} className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-50">{copied === c.id ? "Copied" : "Copy their link"}</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!open ? (
        available.length > 0 && (
          <button onClick={() => setOpen(true)} className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium hover:bg-slate-50">Send to more clients</button>
        )
      ) : (
        <div className="grid gap-3">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick picks">
            <button onClick={() => pick(available.map((c) => c.id))} className="rounded-full border border-slate-300 px-3 py-1 hover:bg-slate-50">All clients</button>
            {team && <button onClick={() => pick(available.filter((c) => c.assignedToId === sendMany.meId).map((c) => c.id))} className="rounded-full border border-slate-300 px-3 py-1 hover:bg-slate-50">My clients</button>}
            {team && sendMany.staff.filter((s) => s.id !== sendMany.meId).map((s) => (
              <button key={s.id} onClick={() => pick(available.filter((c) => c.assignedToId === s.id).map((c) => c.id))} className="rounded-full border border-slate-300 px-3 py-1 hover:bg-slate-50">{s.name}&apos;s clients</button>
            ))}
            {picked.size > 0 && <button onClick={() => setPicked(new Set())} className="rounded-full px-3 py-1 text-slate-500 hover:text-slate-900">Clear</button>}
          </div>
          <ul className="grid max-h-64 gap-1 overflow-y-auto rounded-lg border border-slate-200 p-2 sm:grid-cols-2">
            {available.map((c) => (
              <li key={c.id}>
                <label className="flex items-center gap-2 rounded px-2 py-1 hover:bg-slate-50">
                  <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} disabled={!c.teamKeyWrap} />
                  <span>{c.name}</span>
                </label>
              </li>
            ))}
          </ul>
          <label className="flex items-center gap-2 text-slate-700">
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
            Email clients who have an address on file
          </label>
          <div className="flex items-center gap-3">
            <button onClick={send} disabled={busy || picked.size === 0} className="rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
              {busy ? "Sending…" : `Send to ${picked.size} ${picked.size === 1 ? "client" : "clients"}`}
            </button>
            <button onClick={() => setOpen(false)} className="text-slate-500 hover:text-slate-900">Done</button>
          </div>
          <p className="text-xs text-slate-500">Each client gets a private copy. They can reply, but never see each other&apos;s replies.</p>
        </div>
      )}
      {note && <p role="status" className="mt-2 text-slate-700">{note}</p>}
    </div>
  );
}
