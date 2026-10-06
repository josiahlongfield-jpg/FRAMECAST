import { Directory, File, Paths } from "expo-file-system";
import { api, ApiError } from "./api";

/**
 * Durable upload queue. A finished recording is moved out of the cache into
 * the app's documents folder together with a small manifest, then sent in
 * 5 MiB parts. If the app is killed or the network drops, the next launch
 * resumes from the first unconfirmed part.
 */

const PART_BYTES = 5 * 1024 * 1024;
const dir = new Directory(Paths.document, "pending-uploads");

type Manifest = { videoId: string; file: string; nextPart: number; durationMs: number };

function ensureDir() {
  if (!dir.exists) dir.create({ intermediates: true });
}

function manifestFile(videoId: string) {
  return new File(dir, `${videoId}.json`);
}

function save(m: Manifest) {
  const f = manifestFile(m.videoId);
  f.write(JSON.stringify(m));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function retrying<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 408 && err.status !== 429) throw err;
      if (attempt >= 8) throw err;
      await sleep(Math.min(30_000, 1000 * 2 ** attempt));
    }
  }
}

/** Register a just-recorded file and upload it. Returns the share id. */
export async function queueRecording(recordingUri: string, durationMs: number, onProgress?: (fraction: number) => void) {
  ensureDir();
  const { video } = await api<{ video: { id: string } }>("/api/videos", { method: "POST", json: { mimeType: "video/mp4" } });
  const dest = new File(dir, `${video.id}.mp4`);
  new File(recordingUri).moveSync(dest);
  const m: Manifest = { videoId: video.id, file: dest.uri, nextPart: 1, durationMs };
  save(m);
  await drive(m, onProgress);
  return video.id;
}

async function drive(m: Manifest, onProgress?: (fraction: number) => void) {
  const file = new File(m.file);
  const size = file.size;
  const totalParts = Math.max(1, Math.ceil(size / PART_BYTES));
  const handle = file.open();
  try {
    for (let part = m.nextPart; part <= totalParts; part++) {
      handle.offset = (part - 1) * PART_BYTES;
      const bytes = handle.readBytes(Math.min(PART_BYTES, size - (part - 1) * PART_BYTES));
      await retrying(() => api(`/api/videos/${m.videoId}/parts/${part}`, { method: "PUT", body: bytes as unknown as BodyInit }));
      m.nextPart = part + 1;
      save(m);
      onProgress?.(part / totalParts);
    }
  } finally {
    handle.close();
  }
  await retrying(() => api(`/api/videos/${m.videoId}/complete`, { method: "POST", json: { partCount: totalParts, durationMs: m.durationMs } }));
  file.delete();
  manifestFile(m.videoId).delete();
}

/** Resume uploads interrupted by a crash, kill or lost connection. */
export async function resumePending(): Promise<string[]> {
  ensureDir();
  const done: string[] = [];
  for (const entry of dir.list()) {
    if (!(entry instanceof File) || !entry.name.endsWith(".json")) continue;
    const m = JSON.parse(entry.textSync()) as Manifest;
    try {
      await drive(m);
      done.push(m.videoId);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        entry.delete();
        const f = new File(m.file);
        if (f.exists) f.delete();
      }
    }
  }
  return done;
}
