"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { decryptText, encryptText } from "@/lib/e2e/crypto";
import type { DeviceSupport, Progress, Summary, Transcript } from "@/lib/ai/transcribe";

export type SealedInsight = { transcript: string; summary: string | null } | null;

type Props = {
  videoId: string;
  /** The video's key: the transcript and summary are sealed with it, like replies. */
  rootKey: CryptoKey;
  initial: SealedInsight;
  /**
   * Team member in a workspace with the add-on on, and the upload has fully
   * finished: may make transcripts (clients never do).
   */
  canMake: boolean;
  /** The decrypted recording on this device, once it's ready. */
  mediaUrl: string | null;
  durationMs: number | null;
  /** Team member: may remove the transcript and summary (even with the add-on off). */
  canRemove: boolean;
  onSeek: (ms: number) => void;
};

type Status =
  | { kind: "idle" }
  | { kind: "working"; progress: Progress }
  | { kind: "summarising" }
  | { kind: "failed"; message: string; device: boolean }
  | { kind: "summaryFailed"; message: string };

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/**
 * The AI summary and transcript under a video. The team makes them on their
 * own device (transcript) plus Claude (summary from the transcript text);
 * everyone who can watch the video reads them, decrypted here.
 */
export default function AiInsight({ videoId, rootKey, initial, canMake, mediaUrl, canRemove, onSeek }: Props) {
  const [sealed, setSealed] = useState<SealedInsight>(initial);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [unreadable, setUnreadable] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [support, setSupport] = useState<DeviceSupport | null>(null);
  const started = useRef(false);

  // Unlock what's saved.
  useEffect(() => {
    if (!sealed) return;
    (async () => {
      setTranscript(JSON.parse(await decryptText(sealed.transcript, rootKey)) as Transcript);
      setSummary(sealed.summary ? (JSON.parse(await decryptText(sealed.summary, rootKey)) as Summary) : null);
    })().catch(() => setUnreadable(true));
  }, [sealed, rootKey]);

  // The model code only loads for workspaces with the add-on, and only when needed.
  useEffect(() => {
    if (!canMake) return;
    import("@/lib/ai/transcribe").then((m) => setSupport(m.deviceSupport()));
  }, [canMake]);

  const save = useCallback(
    async (t: Transcript, s: Summary | null) => {
      const body = { transcript: await encryptText(JSON.stringify(t), rootKey), summary: s ? await encryptText(JSON.stringify(s), rootKey) : null };
      const res = await fetch(`/api/videos/${videoId}/insight`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Couldn't save the transcript");
      setSealed(body);
    },
    [rootKey, videoId],
  );

  const summarise = useCallback(
    async (t: Transcript) => {
      setStatus({ kind: "summarising" });
      try {
        const { transcriptText } = await import("@/lib/ai/transcribe");
        const res = await fetch(`/api/videos/${videoId}/summary`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript: transcriptText(t) }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          await save(t, null);
          setStatus({ kind: "summaryFailed", message: data.error ?? "Couldn't write the summary just now." });
          return;
        }
        await save(t, data.summary as Summary);
        setSummary(data.summary as Summary);
        setStatus({ kind: "idle" });
      } catch (err) {
        setStatus({ kind: "summaryFailed", message: (err as Error).message });
      }
    },
    [save, videoId],
  );

  const make = useCallback(async () => {
    if (!mediaUrl) return;
    started.current = true;
    setStatus({ kind: "working", progress: { stage: "audio", fraction: 0 } });
    try {
      const { transcribe, UnsupportedDevice } = await import("@/lib/ai/transcribe");
      let t: Transcript;
      try {
        const media = await (await fetch(mediaUrl)).blob();
        t = await transcribe(media, (progress) => setStatus({ kind: "working", progress }));
      } catch (err) {
        setStatus({ kind: "failed", message: (err as Error).message, device: err instanceof UnsupportedDevice });
        return;
      }
      setTranscript(t);
      if (!t.segments.length) {
        await save(t, null);
        setStatus({ kind: "summaryFailed", message: "No speech was found in this recording, so there's nothing to summarise." });
        return;
      }
      await summarise(t);
    } catch (err) {
      setStatus({ kind: "failed", message: (err as Error).message, device: false });
    }
  }, [mediaUrl, save, summarise]);

  async function remove() {
    if (!confirm("Remove this video's transcript and summary? Your team and client won't see them any more.")) return;
    const res = await fetch(`/api/videos/${videoId}/insight`, { method: "DELETE" });
    if (!res.ok) return;
    started.current = true;
    setSealed(null);
    setTranscript(null);
    setSummary(null);
    setStatus({ kind: "idle" });
  }

  if (!sealed && !canMake) return null;

  const busy = status.kind === "working" || status.kind === "summarising";
  return (
    <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5" data-testid="ai-insight" aria-busy={busy}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-slate-900">Summary</h2>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">AI</span>
      </div>

      {unreadable && <p className="mt-2 text-sm text-slate-600">This summary was locked with a different key and can&apos;t be opened on this device.</p>}

      {status.kind === "working" && <Working progress={status.progress} />}
      {status.kind === "summarising" && <p role="status" className="mt-2 text-sm text-slate-600">Transcript done. Writing the summary…</p>}

      {status.kind === "failed" && (
        <div role="alert" className="mt-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900" data-testid="ai-failed">
          <p className="font-medium">Transcript unavailable, try again.</p>
          <p className="mt-1 text-amber-800">
            {status.device || support?.mobile || support?.lowMemory
              ? "This device may not be able to make transcripts. A computer with Chrome or Edge and plenty of memory works best."
              : "Something went wrong making the transcript. Your video is safe and unchanged."}
          </p>
          <button onClick={make} className="mt-2 rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-medium hover:bg-amber-100">Try again</button>
        </div>
      )}

      {summary ? (
        <div className="mt-2 text-sm text-slate-700" data-testid="ai-summary">
          <p className="whitespace-pre-wrap">{summary.overview}</p>
          {summary.keyPoints.length > 0 && (
            <>
              <h3 className="mt-3 font-medium text-slate-900">Key points</h3>
              <ul className="mt-1 list-disc space-y-1 pl-5">{summary.keyPoints.map((p, i) => <li key={i}>{p}</li>)}</ul>
            </>
          )}
          {summary.actionItems.length > 0 && (
            <>
              <h3 className="mt-3 font-medium text-slate-900">Action items</h3>
              <ul className="mt-1 list-disc space-y-1 pl-5">{summary.actionItems.map((p, i) => <li key={i}>{p}</li>)}</ul>
            </>
          )}
          <p className="mt-3 text-xs text-slate-500">Written by AI from an automatic transcript. It can contain mistakes, so check anything important against the video.</p>
        </div>
      ) : (
        !busy &&
        status.kind !== "failed" &&
        !transcript &&
        canMake && (
          <div className="mt-2 text-sm text-slate-600">
            <p>Make a transcript on this device and a short AI summary of this video. The audio stays on this device; only the transcript text is sent to write the summary.</p>
            {(support?.mobile || support?.lowMemory) && <p className="mt-1 text-amber-800">This device may struggle with this. It works best on a computer.</p>}
            {support && !support.device ? (
              <p className="mt-2 text-amber-800">This browser can&apos;t make transcripts. Try again on a computer with Chrome or Edge.</p>
            ) : (
              <button
                onClick={make}
                disabled={!mediaUrl || !support}
                className="mt-3 rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                Make transcript and summary
              </button>
            )}
          </div>
        )
      )}

      {status.kind === "summaryFailed" && (
        <div role="alert" className="mt-2 text-sm text-slate-700">
          <p>{status.message}</p>
          {transcript && transcript.segments.length > 0 && (
            <button onClick={() => summarise(transcript)} className="mt-2 rounded-lg border border-slate-300 px-3 py-1.5 font-medium hover:bg-slate-50">Try the summary again</button>
          )}
        </div>
      )}
      {!summary && transcript && status.kind === "idle" && canMake && transcript.segments.length > 0 && (
        <button onClick={() => summarise(transcript)} className="mt-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50">Write the summary</button>
      )}

      {transcript && (
        <details className="mt-4 border-t border-slate-100 pt-3 text-sm" data-testid="ai-transcript">
          <summary className="cursor-pointer font-medium text-slate-900">Transcript</summary>
          {transcript.segments.length === 0 ? (
            <p className="mt-2 text-slate-500">No speech was found.</p>
          ) : (
            <ol className="mt-2 max-h-96 space-y-1.5 overflow-y-auto pr-1 text-slate-700">
              {transcript.segments.map((s, i) => (
                <li key={i} className="flex gap-2">
                  <button onClick={() => onSeek(Math.round(s.start * 1000))} className="shrink-0 rounded bg-slate-100 px-1.5 text-xs font-medium text-brand-700 hover:bg-slate-200">
                    {fmt(s.start)}
                  </button>
                  <span>{s.text}</span>
                </li>
              ))}
            </ol>
          )}
          <p className="mt-2 text-xs text-slate-500">Made automatically on the sender&apos;s device. Words, names and numbers can be misheard.</p>
        </details>
      )}
      {canRemove && sealed && !busy && (
        <button onClick={remove} className="mt-3 text-xs text-slate-500 underline hover:text-slate-900">Remove transcript and summary</button>
      )}
    </section>
  );
}

function Working({ progress }: { progress: Progress }) {
  const label =
    progress.stage === "audio"
      ? "Getting the sound ready…"
      : progress.stage === "download"
        ? `Downloading the transcription model to this device${progress.bytes ? ` (${Math.round(progress.bytes / 1_000_000)} MB, first time only)` : ""}…`
        : "Making the transcript on this device…";
  return (
    <div role="status" className="mt-2 text-sm text-slate-600">
      <p>{label} You can keep watching while this runs.</p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${Math.max(3, Math.round(progress.fraction * 100))}%` }} />
      </div>
    </div>
  );
}
