"use client";

import { useEffect, useRef, useState } from "react";
import * as store from "@/lib/recorder/store";
import { ChunkedUploader, lockName, type UploadState } from "@/lib/recorder/uploader";
import { bitrateFor, pickMimeType, stopAll } from "@/lib/recorder/media";
import { encryptFrame, encryptText, generateKey, wrapKey } from "@/lib/e2e/crypto";
import type { ReplyDTO } from "@/lib/replies";
import MicLevel from "./MicLevel";

type Mode = "TEXT" | "VIDEO" | "AUDIO";
type Phase = "idle" | "preview" | "recording" | "sending";

const AUDIO_TYPES = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"];

function pickAudioType() {
  return AUDIO_TYPES.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) ?? "audio/webm";
}

const fmt = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export default function ReplyComposer({
  videoId,
  conversationKey,
  currentTimeMs,
  onReplied,
}: {
  videoId: string;
  /** The conversation's video key: seals text replies and wraps each reply's media key. */
  conversationKey: CryptoKey;
  currentTimeMs: () => number | undefined;
  onReplied: (r: ReplyDTO) => void;
}) {
  const [mode, setMode] = useState<Mode>("TEXT");
  // The open camera/mic stream, so the microphone level bar can follow it.
  const [liveStream, setLiveStream] = useState<MediaStream | null>(null);
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [elapsed, setElapsed] = useState(0);
  const [upload, setUpload] = useState<UploadState>();
  const [error, setError] = useState<string>();
  const [maxMs, setMaxMs] = useState(15 * 60_000);
  const [session, setSession] = useState(0);

  const preview = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const live = useRef<{
    recorder: MediaRecorder;
    uploader: ChunkedUploader;
    mediaId: string;
    startedAt: number;
    release: () => void;
    sealing: Promise<void>;
  } | null>(null);

  // Live camera/mic preview while a media mode is selected.
  // Re-acquired when the mode or camera changes, and after each sent reply.
  useEffect(() => {
    if (mode === "TEXT") return;
    let cancelled = false;
    setPhase("idle");
    setError(undefined);
    navigator.mediaDevices
      .getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: mode === "VIDEO" ? { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } } : false,
      })
      .then((s) => {
        if (cancelled) return stopAll(s);
        stopAll(stream.current);
        stream.current = s;
        setLiveStream(s);
        if (preview.current) preview.current.srcObject = s;
        setPhase("preview");
      })
      .catch(() => setError(`Allow ${mode === "VIDEO" ? "camera and microphone" : "microphone"} access in your browser to record a reply.`));
    return () => {
      cancelled = true;
    };
  }, [mode, facing, session]);

  // Release the camera when leaving media modes or unmounting.
  useEffect(() => {
    if (mode === "TEXT") {
      stopAll(stream.current);
      stream.current = null;
      setLiveStream(null);
      setPhase("idle");
    }
  }, [mode]);
  useEffect(() => () => stopAll(stream.current), []);

  useEffect(() => {
    if (phase !== "recording") return;
    const t = setInterval(() => {
      const ms = performance.now() - (live.current?.startedAt ?? performance.now());
      setElapsed(ms);
      if (ms >= maxMs) void stop();
    }, 250);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, maxMs]);

  async function sendText(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setPhase("sending");
    setError(undefined);
    const res = await fetch(`/api/videos/${videoId}/replies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "TEXT", body: await encryptText(text, conversationKey), encrypted: true, timestampMs: currentTimeMs() }),
    });
    const data = await res.json().catch(() => ({}));
    setPhase("idle");
    if (!res.ok) return setError(data.error ?? "Could not send your reply");
    setText("");
    onReplied(data.reply);
  }

  async function start() {
    if (!stream.current) return;
    setError(undefined);
    const mimeType = mode === "VIDEO" ? pickMimeType() : pickAudioType();
    const mediaKey = await generateKey();
    const res = await fetch(`/api/videos/${videoId}/replies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: mode, mimeType, parentKeyWrap: await wrapKey(mediaKey, conversationKey) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(data.error ?? "Could not start your reply");
    setMaxMs(data.maxDurationMin * 60_000);
    const mediaId: string = data.mediaId;

    await store.putSession({
      videoId: mediaId,
      title: "Reply",
      mimeType,
      startedAt: Date.now(),
      nextPart: 1,
      durationMs: 0,
      stopped: false,
      uploadToken: data.uploadToken,
      replyTo: videoId,
    });
    let release = () => {};
    await new Promise<void>((held) => {
      navigator.locks.request(lockName(mediaId), () => new Promise<void>((r) => {
        release = r;
        held();
      }));
    });

    const uploader = new ChunkedUploader(mediaId, { uploadToken: data.uploadToken }, setUpload);
    const recorder = new MediaRecorder(stream.current, {
      mimeType,
      ...(mode === "VIDEO" ? { videoBitsPerSecond: bitrateFor(1080) } : { audioBitsPerSecond: 128_000 }),
    });
    recorder.ondataavailable = (e) => {
      const l = live.current;
      if (!l || e.data.size === 0) return;
      // Encrypted on this device, in order, before it is saved or sent.
      l.sealing = l.sealing.then(() => encryptFrame(e.data, mediaKey)).then((frame) => uploader.push(new Blob([frame as BlobPart])));
    };
    live.current = { recorder, uploader, mediaId, startedAt: performance.now(), release, sealing: Promise.resolve() };
    recorder.start(2000);
    setElapsed(0);
    setPhase("recording");
  }

  async function stop() {
    const l = live.current;
    if (!l || l.recorder.state === "inactive") return;
    const durationMs = Math.round(performance.now() - l.startedAt);
    setPhase("sending");
    const stopped = new Promise<void>((r) => l.recorder.addEventListener("stop", () => r(), { once: true }));
    l.recorder.stop();
    await stopped;
    await l.sealing;
    stopAll(stream.current);
    stream.current = null;
    try {
      await store.updateSession(l.mediaId, { durationMs, stopped: true });
      await l.uploader.finish(durationMs);
      const res = await fetch(`/api/videos/${videoId}/replies`);
      const { replies } = (await res.json()) as { replies: ReplyDTO[] };
      const mine = replies.find((r) => r.media?.id === l.mediaId);
      if (mine) onReplied(mine);
      setMode("TEXT");
    } catch (err) {
      setError(`${(err as Error).message}. Your reply is saved on this device and will finish sending next time you open this page.`);
    } finally {
      l.release();
      live.current = null;
      setPhase("idle");
      setSession((n) => n + 1);
    }
  }

  const tabs: { id: Mode; label: string }[] = [
    { id: "TEXT", label: "Text" },
    { id: "VIDEO", label: "Video" },
    { id: "AUDIO", label: "Voice" },
  ];
  const busy = phase === "recording" || phase === "sending";

  return (
    <div className="border-t border-slate-100 p-4">
      <div role="tablist" aria-label="Reply type" className="mb-3 grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1 text-sm">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={mode === t.id}
            disabled={busy}
            onClick={() => setMode(t.id)}
            className={`rounded-md px-2 py-1.5 font-medium transition disabled:opacity-50 ${mode === t.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
          >
            {t.label}
          </button>
        ))}
      </div>


      {mode === "TEXT" ? (
        <form onSubmit={sendText}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends; Shift+Enter starts a new line.
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Write a reply…"
            aria-label="Reply"
            rows={3}
            className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none"
          />
          <button disabled={busy || !text.trim()} className="mt-2 w-full rounded-lg bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
            {phase === "sending" ? "Sending…" : "Send reply"}
          </button>
        </form>
      ) : (
        <div>
          {mode === "VIDEO" ? (
            <div className="relative overflow-hidden rounded-lg bg-slate-900">
              <video ref={preview} autoPlay muted playsInline className={`aspect-video w-full object-cover ${facing === "user" ? "-scale-x-100" : ""}`} />
              {phase === "preview" && (
                <button onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))} className="absolute right-2 top-2 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white">
                  Flip camera
                </button>
              )}
              {phase === "recording" && <RecBadge ms={elapsed} />}
            </div>
          ) : (
            <div className="relative grid h-20 place-items-center rounded-lg bg-slate-50 text-sm text-slate-500">
              {phase === "recording" ? <RecBadge ms={elapsed} inline /> : "Tap record and start talking"}
            </div>
          )}
          {liveStream && (phase === "preview" || phase === "recording") && (
            <div className="mt-2">
              <MicLevel stream={liveStream} />
            </div>
          )}
          {phase === "recording" ? (
            <button onClick={stop} className="mt-2 w-full rounded-lg bg-red-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-red-700">
              Stop and send
            </button>
          ) : (
            <button onClick={start} disabled={phase !== "preview"} className="mt-2 w-full rounded-lg bg-brand-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
              {phase === "sending" ? "Sending…" : `Record ${mode === "VIDEO" ? "video" : "voice"} reply`}
            </button>
          )}
          {upload?.retrying && <p className="mt-2 text-xs text-amber-700">Connection lost. Still saving on this device; sending resumes automatically.</p>}
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}

function RecBadge({ ms, inline = false }: { ms: number; inline?: boolean }) {
  return (
    <span className={`${inline ? "" : "absolute left-2 top-2 "}flex items-center gap-2 rounded-full bg-black/70 px-3 py-1 text-xs font-medium text-white`}>
      <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> Recording · {fmt(ms)}
    </span>
  );
}
