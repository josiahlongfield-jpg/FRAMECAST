/// <reference lib="webworker" />
// On-device speech to text for the AI summaries add-on. Runs Whisper in this
// worker with Transformers.js (WebGPU when available, otherwise WebAssembly).
// Audio arrives already decoded and never leaves the device. The model and
// runtime are served by SureFrame itself (our site, or our own storage) at a
// pinned revision, and every model file is checked against its sha256 before
// use; this worker refuses to fetch anything else.
import manifest from "./whisper-model.json";
import type { TranscriptSegment, WorkerIn, WorkerOut } from "./transcribe";

const SAMPLE_RATE = 16_000;
/** Audio is handled in two-minute pieces so progress can be shown. */
const SEGMENT_SECONDS = 120;

const post = (msg: WorkerOut) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg);
const files = manifest.files as Record<string, { sha256: string; bytes: number }>;

type Asr = (audio: Float32Array, options: Record<string, unknown>) => Promise<{ text: string; chunks?: { timestamp: [number, number | null]; text: string }[] }>;
let loading: Promise<Asr> | null = null;

const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");

async function load(device: "webgpu" | "wasm", modelBase: string): Promise<Asr> {
  if (!manifest.revision) throw new Error("The transcription model hasn't been set up on this server yet.");
  const { pipeline, env } = await import("@huggingface/transformers");
  const prefix = `${modelBase}${manifest.model}/${manifest.revision}/`;
  env.allowLocalModels = false;
  env.allowRemoteModels = true;
  env.remoteHost = modelBase;
  env.remotePathTemplate = "{model}/{revision}/";
  // The ONNX runtime comes from our own site too (copied there on install).
  const ort = `${self.location.origin}/ort/`;
  const safari = /^((?!chrome|android).)*safari/i.test(self.navigator.userAgent);
  if (env.backends.onnx.wasm) {
    env.backends.onnx.wasm.wasmPaths = safari
      ? { mjs: `${ort}ort-wasm-simd-threaded.mjs`, wasm: `${ort}ort-wasm-simd-threaded.wasm` }
      : { mjs: `${ort}ort-wasm-simd-threaded.asyncify.mjs`, wasm: `${ort}ort-wasm-simd-threaded.asyncify.wasm` };
  }

  // Only the pinned model files, each checked against its recorded hash.
  const progress = new Map<string, number>();
  const total = Object.values(files).reduce((n, f) => n + f.bytes, 0);
  env.fetch = async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith(ort)) return fetch(url, init);
    const name = url.startsWith(prefix) ? url.slice(prefix.length).split("?")[0] : null;
    const expected = name ? files[name] : undefined;
    if (!name || !expected) return new Response(null, { status: 404 });
    const res = await fetch(url, { ...init, cache: "no-store" });
    if (!res.ok || !res.body) throw new Error(`Couldn't download the transcription model (${res.status}).`);
    const reader = res.body.getReader();
    const parts: Uint8Array[] = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      got += value.length;
      progress.set(name, got);
      post({ type: "progress", stage: "download", fraction: [...progress.values()].reduce((a, b) => a + b, 0) / total, bytes: total });
    }
    const body = new Uint8Array(got);
    let at = 0;
    for (const p of parts) {
      body.set(p, at);
      at += p.length;
    }
    if (hex(await crypto.subtle.digest("SHA-256", body)) !== expected.sha256) throw new Error("The transcription model didn't download correctly.");
    return new Response(body, { status: 200, headers: { "Content-Type": res.headers.get("Content-Type") ?? "application/octet-stream", "Content-Length": String(got) } });
  };

  const asr = await pipeline("automatic-speech-recognition", manifest.model, {
    revision: manifest.revision,
    device,
    dtype: device === "webgpu" ? { encoder_model: "fp32", decoder_model_merged: "q4" } : { encoder_model: "q8", decoder_model_merged: "q8" },
  });
  return asr as unknown as Asr;
}

self.onmessage = async (e: MessageEvent<WorkerIn>) => {
  const { channels, device, modelBase } = e.data;
  try {
    // Mix down to mono here, off the page's main thread.
    const audio = channels.length === 1 ? channels[0] : new Float32Array(channels[0].length);
    if (channels.length > 1) for (const ch of channels) for (let i = 0; i < ch.length; i++) audio[i] += ch[i] / channels.length;

    loading ??= load(device, modelBase);
    const asr = await loading;
    const segments: TranscriptSegment[] = [];
    const step = SEGMENT_SECONDS * SAMPLE_RATE;
    for (let start = 0; start < audio.length; start += step) {
      post({ type: "progress", stage: "transcribe", fraction: start / audio.length });
      const piece = audio.subarray(start, Math.min(audio.length, start + step));
      const offset = start / SAMPLE_RATE;
      const out = await asr(piece, { chunk_length_s: 30, stride_length_s: 5, return_timestamps: true, task: "transcribe" });
      for (const c of out.chunks ?? [{ timestamp: [0, piece.length / SAMPLE_RATE] as [number, number], text: out.text }]) {
        const text = c.text.trim();
        if (!text) continue;
        segments.push({ start: offset + (c.timestamp[0] ?? 0), end: offset + (c.timestamp[1] ?? piece.length / SAMPLE_RATE), text });
      }
    }
    post({ type: "done", transcript: { v: 1, segments } });
  } catch (err) {
    loading = null;
    post({ type: "error", message: (err as Error)?.message ?? String(err) });
  }
};
