// Installs the on-device speech model (AI summaries add-on) into our own
// storage bucket, so browsers get it from SureFrame and never from Hugging
// Face or a CDN. The founder starts it from /support/accounts; the page copies
// one file per request (each stays well inside a function's time limit), then
// writes models/manifest.json last, so a half-finished install is never used.
import { createHash } from "node:crypto";
import { MIN_PART_BYTES, storage, storageKind } from "@/lib/storage";
import { isManifest, ONNX_FILES, SPEECH_MODEL, type ModelFile, type ModelManifest } from "./modelManifest";

export const MANIFEST_KEY = "models/manifest.json";
/** Bytes held in memory per upload part while copying a file. */
const PART_BYTES = Math.max(MIN_PART_BYTES, 16 * 1024 * 1024);

/** Hugging Face. HF_BASE_URL points it at a stand-in, for automated tests only (ignored in production). */
const hub = () => (process.env.NODE_ENV !== "production" && process.env.HF_BASE_URL) || "https://huggingface.co";

export const isRevision = (r: unknown): r is string => typeof r === "string" && /^[0-9a-f]{40}$/.test(r);
export const fileKey = (model: string, revision: string, name: string) => `models/${model}/${revision}/${name}`;
const receiptKey = (revision: string, name: string) => `models/.staging/${revision}/${name}.json`;

export class InstallError extends Error {}

/** Where the model can be installed: the bucket (or local files in development), never Postgres. */
export function canInstall() {
  return storageKind() !== "db";
}

// ---------- Reading the installed manifest ----------

// Only a found manifest is cached (briefly, per server), so a new install shows
// up at once; after an update, the old revision's files are still there.
let cached: { at: number; value: ModelManifest } | null = null;
const CACHE_MS = 30_000;

/** The installed manifest, or null when the model isn't installed. */
export async function readManifest(fresh = false): Promise<ModelManifest | null> {
  if (!fresh && cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  const raw = await storage().getObject(MANIFEST_KEY);
  let value: ModelManifest | null = null;
  if (raw) {
    try {
      const parsed = JSON.parse(raw.toString("utf8"));
      if (isManifest(parsed)) value = parsed;
    } catch {
      value = null;
    }
  }
  cached = value ? { at: Date.now(), value } : null;
  return value;
}

// ---------- Installing ----------

type HubFile = { name: string; bytes: number | null; sha256: string | null };
export type InstallPlan = { model: string; revision: string; files: (HubFile & { done: boolean })[]; installedRevision: string | null };

/** The files to copy at one revision (the JSON files at the top level plus the ONNX files the app uses). */
async function hubFiles(want: string): Promise<{ revision: string; files: HubFile[] }> {
  const res = await fetch(`${hub()}/api/models/${SPEECH_MODEL}/revision/${encodeURIComponent(want)}?blobs=true`, { cache: "no-store" });
  if (!res.ok) throw new InstallError(`Hugging Face didn't answer (HTTP ${res.status}). Try again in a minute.`);
  const info = (await res.json()) as { sha?: string; siblings?: { rfilename: string; size?: number; lfs?: { sha256?: string; size?: number } }[] };
  if (!isRevision(info.sha)) throw new InstallError(`Couldn't find the current version of ${SPEECH_MODEL}.`);
  const files = (info.siblings ?? [])
    .filter((s) => (!s.rfilename.includes("/") && s.rfilename.endsWith(".json")) || ONNX_FILES.includes(s.rfilename))
    .map((s) => ({ name: s.rfilename, bytes: s.lfs?.size ?? s.size ?? null, sha256: s.lfs?.sha256 ?? null }));
  for (const f of ONNX_FILES) if (!files.some((x) => x.name === f)) throw new InstallError(`${f} is missing from ${SPEECH_MODEL} at ${info.sha}.`);
  if (!files.some((f) => f.name === "config.json")) throw new InstallError(`config.json is missing from ${SPEECH_MODEL} at ${info.sha}.`);
  return { revision: info.sha, files };
}

/** Step 1: resolve the current main revision and list what to copy (and what's already copied). */
export async function planInstall(): Promise<InstallPlan> {
  const { revision, files } = await hubFiles("main");
  const done = await Promise.all(files.map(async (f) => !!(await storage().getObject(receiptKey(revision, f.name)))));
  const installed = await readManifest(true);
  return { model: SPEECH_MODEL, revision, files: files.map((f, i) => ({ ...f, done: done[i] })), installedRevision: installed?.revision ?? null };
}

/** Step 2 (once per file): copy one file at that exact revision into storage, hashing it on the way. */
export async function installFile(revision: string, name: string): Promise<ModelFile> {
  if (!isRevision(revision)) throw new InstallError("Unknown version.");
  const { files } = await hubFiles(revision);
  const want = files.find((f) => f.name === name);
  if (!want) throw new InstallError(`${name} isn't part of the model.`);

  const res = await fetch(`${hub()}/${SPEECH_MODEL}/resolve/${revision}/${name}`, { cache: "no-store" });
  if (!res.ok || !res.body) throw new InstallError(`Couldn't download ${name} (HTTP ${res.status}).`);

  const key = fileKey(SPEECH_MODEL, revision, name);
  const type = name.endsWith(".json") ? "application/json" : "application/octet-stream";
  const driver = storage();
  const hash = createHash("sha256");
  let bytes = 0;
  let pending: Uint8Array[] = [];
  let pendingBytes = 0;
  let uploadId: string | null | undefined; // undefined until the file turns out to need more than one part
  const parts: { partNumber: number; etag: string | null }[] = [];
  // R2 (like S3) needs every part but the last to be exactly the same size,
  // so each flush sends PART_BYTES and carries the rest into the next part.
  const flush = async (last = false) => {
    const all = Buffer.concat(pending, pendingBytes);
    const size = last ? all.length : PART_BYTES;
    const body = all.subarray(0, size);
    const rest = all.subarray(size);
    pending = rest.length ? [rest] : [];
    pendingBytes = rest.length;
    if (uploadId === undefined) uploadId = await driver.begin(key, type);
    const partNumber = parts.length + 1;
    parts.push({ partNumber, etag: await driver.putPart(key, uploadId, partNumber, body) });
  };

  const reader = res.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      hash.update(value);
      bytes += value.length;
      pending.push(value);
      pendingBytes += value.length;
      while (pendingBytes >= PART_BYTES) await flush();
    }
    const sha256 = hash.digest("hex");
    if (want.bytes !== null && bytes !== want.bytes) throw new InstallError(`${name} downloaded incompletely (${bytes} of ${want.bytes} bytes).`);
    if (want.sha256 && sha256 !== want.sha256) throw new InstallError(`${name} didn't match Hugging Face's own checksum.`);
    if (uploadId === undefined) {
      await driver.putObject(key, Buffer.concat(pending, pendingBytes), type);
    } else {
      if (pendingBytes) await flush(true);
      await driver.complete(key, uploadId, parts);
    }
    const file = { sha256, bytes };
    // A receipt per copied file; the manifest is only written from these.
    await driver.putObject(receiptKey(revision, name), Buffer.from(JSON.stringify(file)), "application/json");
    return file;
  } catch (err) {
    await reader.cancel().catch(() => {});
    if (uploadId !== undefined) await driver.abort(key, uploadId).catch(() => {});
    throw err;
  }
}

/** Step 3: once every file is copied, write the manifest (last), which makes the model live. */
export async function finishInstall(revision: string): Promise<ModelManifest> {
  if (!isRevision(revision)) throw new InstallError("Unknown version.");
  const { files } = await hubFiles(revision);
  const out: Record<string, ModelFile> = {};
  for (const f of files) {
    const raw = await storage().getObject(receiptKey(revision, f.name));
    if (!raw) throw new InstallError(`${f.name} hasn't been copied yet. Press Install again to finish.`);
    out[f.name] = JSON.parse(raw.toString("utf8")) as ModelFile;
  }
  const manifest: ModelManifest = { model: SPEECH_MODEL, revision, files: out, installedAt: new Date().toISOString() };
  await storage().putObject(MANIFEST_KEY, Buffer.from(JSON.stringify(manifest, null, 2)), "application/json");
  cached = { at: Date.now(), value: manifest };
  return manifest;
}
