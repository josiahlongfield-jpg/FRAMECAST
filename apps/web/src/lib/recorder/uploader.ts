import * as store from "./store";

/** Matches the S3 minimum part size; only the final part may be smaller. */
export const PART_BYTES = 5 * 1024 * 1024;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type UploadState = { uploadedBytes: number; bufferedBytes: number; retrying: boolean; error?: string };

async function withRetry<T>(fn: () => Promise<T>, onRetry: (retrying: boolean) => void): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      const out = await fn();
      if (attempt > 0) onRetry(false);
      return out;
    } catch (err) {
      if (err instanceof FatalUploadError) throw err;
      onRetry(true);
      // 1s, 2s, 4s ... capped at 30s. Keeps going while offline; chunks are safe in IndexedDB.
      await sleep(Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5)));
    }
  }
}

export class FatalUploadError extends Error {}

async function sendPart(videoId: string, partNumber: number, body: Blob) {
  const res = await fetch(`/api/videos/${videoId}/parts/${partNumber}`, { method: "PUT", body });
  if (res.ok) return;
  if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
    const msg = (await res.json().catch(() => null))?.error ?? `Upload rejected (${res.status})`;
    throw new FatalUploadError(msg);
  }
  throw new Error(`Upload failed (${res.status})`);
}

async function sendComplete(videoId: string, partCount: number, durationMs: number) {
  const res = await fetch(`/api/videos/${videoId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ partCount, durationMs }),
  });
  if (res.ok) return;
  if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
    throw new FatalUploadError((await res.json().catch(() => null))?.error ?? `Could not finish upload (${res.status})`);
  }
  throw new Error(`Complete failed (${res.status})`);
}

/**
 * Streams a recording to the server while it is being made.
 * Chunks are persisted locally first, grouped into >= 5 MiB parts, and sent
 * strictly in order with retries. A part is only forgotten locally once the
 * server confirms it, so a crash at any point loses nothing.
 */
export class ChunkedUploader {
  private seq = 0;
  private pending: { seq: number; blob: Blob }[] = [];
  private pendingBytes = 0;
  private nextPart: number;
  private queue: Promise<void> = Promise.resolve();
  private intake: Promise<void> = Promise.resolve();
  private uploadedBytes = 0;
  private fatal?: Error;

  constructor(
    private videoId: string,
    opts: { nextPart?: number; startSeq?: number } = {},
    private onState: (s: UploadState) => void = () => {},
  ) {
    this.nextPart = opts.nextPart ?? 1;
    this.seq = opts.startSeq ?? 0;
  }

  /** Add a recorded chunk. Resolves once it is safely in IndexedDB. Chunks are kept in arrival order. */
  push(blob: Blob) {
    if (blob.size === 0) return this.intake;
    const seq = this.seq++;
    this.intake = this.intake.then(async () => {
      await store.putChunk(this.videoId, seq, blob);
      this.pending.push({ seq, blob });
      this.pendingBytes += blob.size;
      this.emit(false);
      if (this.pendingBytes >= PART_BYTES) this.flush(false);
    });
    return this.intake;
  }

  /** Re-queue chunks already in IndexedDB (used by crash recovery). */
  restore(chunks: { seq: number; blob: Blob }[]) {
    for (const c of chunks) {
      this.pending.push(c);
      this.pendingBytes += c.blob.size;
      this.flush(false);
    }
  }

  /** Upload everything left and finalize. */
  async finish(durationMs: number) {
    await this.intake;
    this.flush(true);
    await this.queue;
    if (this.fatal) throw this.fatal;
    const partCount = this.nextPart - 1;
    if (partCount === 0) throw new FatalUploadError("Nothing was recorded");
    await withRetry(() => sendComplete(this.videoId, partCount, durationMs), (r) => this.emit(r));
    await store.removeSession(this.videoId);
  }

  private flush(final: boolean) {
    if (this.pending.length === 0) return;
    if (!final && this.pendingBytes < PART_BYTES) return;
    const batch = this.pending;
    this.pending = [];
    this.pendingBytes = 0;
    const partNumber = this.nextPart++;
    const lastSeq = batch[batch.length - 1].seq;
    const body = new Blob(batch.map((c) => c.blob));
    this.queue = this.queue.then(async () => {
      if (this.fatal) return;
      try {
        await withRetry(() => sendPart(this.videoId, partNumber, body), (r) => this.emit(r));
        await store.confirmPart(this.videoId, lastSeq, partNumber + 1);
        this.uploadedBytes += body.size;
        this.emit(false);
      } catch (err) {
        this.fatal = err as Error;
        this.onState({ uploadedBytes: this.uploadedBytes, bufferedBytes: this.pendingBytes, retrying: false, error: this.fatal.message });
      }
    });
  }

  private emit(retrying: boolean) {
    this.onState({ uploadedBytes: this.uploadedBytes, bufferedBytes: this.pendingBytes, retrying });
  }
}

/**
 * Finish any recordings interrupted by a crash or closed tab.
 * Leftover chunks are re-sent starting at the first unconfirmed part number,
 * which the server treats idempotently.
 */
export async function recoverInterrupted(onRecovered: (videoId: string) => void) {
  const sessions = await store.listSessions();
  for (const s of sessions) {
    // A recording still running in another tab holds this lock; leave it alone.
    await navigator.locks.request(lockName(s.videoId), { ifAvailable: true }, async (lock) => {
      if (!lock) return;
      const chunks = await store.getChunks(s.videoId);
      try {
        const up = new ChunkedUploader(s.videoId, { nextPart: s.nextPart, startSeq: (chunks.at(-1)?.seq ?? -1) + 1 });
        up.restore(chunks);
        await up.finish(s.durationMs);
        onRecovered(s.videoId);
      } catch (err) {
        if (err instanceof FatalUploadError) await store.removeSession(s.videoId);
        else console.warn("Recovery deferred", s.videoId, err);
      }
    });
  }
}

export const lockName = (videoId: string) => `framecast-recording-${videoId}`;
