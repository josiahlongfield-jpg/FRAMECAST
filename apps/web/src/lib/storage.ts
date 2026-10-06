import { promises as fs, createReadStream } from "node:fs";
import path from "node:path";
import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Storage abstraction for chunked, resumable uploads.
 * Parts are idempotent: re-sending a part number overwrites it, which is what
 * makes crash recovery safe on the client.
 */
export interface StorageDriver {
  begin(key: string, mimeType: string): Promise<string | null>;
  putPart(key: string, uploadId: string | null, partNumber: number, body: Uint8Array): Promise<string | null>;
  complete(key: string, uploadId: string | null, parts: { partNumber: number; etag: string | null }[]): Promise<number>;
  abort(key: string, uploadId: string | null): Promise<void>;
  delete(key: string): Promise<void>;
  /** A URL the browser can play directly, or null to stream through /api/videos/:id/stream. */
  playbackUrl(key: string): Promise<string | null>;
  /** Local driver only: open a byte range of the finished file. */
  open?(key: string, range?: { start: number; end: number }): Promise<{ stream: ReadableStream; size: number }>;
}

class LocalDriver implements StorageDriver {
  constructor(private root: string) {}

  private file(key: string) {
    return path.join(this.root, key);
  }
  private partsDir(key: string) {
    return this.file(key) + ".parts";
  }

  async begin(key: string) {
    await fs.mkdir(this.partsDir(key), { recursive: true });
    return null;
  }

  async putPart(key: string, _uploadId: string | null, partNumber: number, body: Uint8Array) {
    const dir = this.partsDir(key);
    await fs.mkdir(dir, { recursive: true });
    const tmp = path.join(dir, `${partNumber}.tmp`);
    await fs.writeFile(tmp, body);
    await fs.rename(tmp, path.join(dir, String(partNumber)));
    return null;
  }

  async complete(key: string, _uploadId: string | null, parts: { partNumber: number }[]) {
    const out = this.file(key);
    const handle = await fs.open(out, "w");
    let size = 0;
    try {
      for (const { partNumber } of [...parts].sort((a, b) => a.partNumber - b.partNumber)) {
        const buf = await fs.readFile(path.join(this.partsDir(key), String(partNumber)));
        await handle.write(buf);
        size += buf.length;
      }
    } finally {
      await handle.close();
    }
    await fs.rm(this.partsDir(key), { recursive: true, force: true });
    return size;
  }

  async abort(key: string) {
    await fs.rm(this.partsDir(key), { recursive: true, force: true });
  }

  async delete(key: string) {
    await this.abort(key);
    await fs.rm(this.file(key), { force: true });
  }

  async playbackUrl() {
    return null;
  }

  async open(key: string, range?: { start: number; end: number }) {
    const file = this.file(key);
    const { size } = await fs.stat(file);
    const node = createReadStream(file, range ? { start: range.start, end: range.end } : undefined);
    const stream = new ReadableStream({
      start(controller) {
        node.on("data", (c) => controller.enqueue(new Uint8Array(c as Buffer)));
        node.on("end", () => controller.close());
        node.on("error", (e) => controller.error(e));
      },
      cancel() {
        node.destroy();
      },
    });
    return { stream, size };
  }
}

class S3Driver implements StorageDriver {
  private s3: S3Client;
  constructor(private bucket: string) {
    this.s3 = new S3Client({
      region: process.env.S3_REGION ?? "auto",
      endpoint: process.env.S3_ENDPOINT || undefined, // set for Cloudflare R2
      forcePathStyle: !!process.env.S3_ENDPOINT,
    });
  }

  async begin(key: string, mimeType: string) {
    const res = await this.s3.send(
      new CreateMultipartUploadCommand({ Bucket: this.bucket, Key: key, ContentType: mimeType }),
    );
    return res.UploadId ?? null;
  }

  async putPart(key: string, uploadId: string | null, partNumber: number, body: Uint8Array) {
    const res = await this.s3.send(
      new UploadPartCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId!, PartNumber: partNumber, Body: body }),
    );
    return res.ETag ?? null;
  }

  async complete(key: string, uploadId: string | null, parts: { partNumber: number; etag: string | null }[]) {
    await this.s3.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId!,
        MultipartUpload: {
          Parts: [...parts]
            .sort((a, b) => a.partNumber - b.partNumber)
            .map((p) => ({ PartNumber: p.partNumber, ETag: p.etag! })),
        },
      }),
    );
    return -1; // size is tracked from parts by the caller
  }

  async abort(key: string, uploadId: string | null) {
    if (!uploadId) return;
    await this.s3.send(new AbortMultipartUploadCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId }));
  }

  async delete(key: string) {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async playbackUrl(key: string) {
    return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: 60 * 60 });
  }
}

/**
 * Keeps video bytes in Postgres, one row per upload part. For previews and
 * small deployments on hosts with no writable disk (e.g. Vercel) and no S3/R2
 * bucket yet. Ranges are served by reading only the parts they touch.
 */
class DbDriver implements StorageDriver {
  private async db() {
    return (await import("@/lib/db")).db;
  }

  async begin() {
    return null;
  }

  async putPart(key: string, _uploadId: string | null, partNumber: number, body: Uint8Array) {
    const db = await this.db();
    const data = Buffer.from(body);
    await db.storedPart.upsert({
      where: { key_partNumber: { key, partNumber } },
      create: { key, partNumber, size: data.length, data },
      update: { size: data.length, data },
    });
    return null;
  }

  async complete(key: string, _uploadId: string | null, parts: { partNumber: number }[]) {
    const db = await this.db();
    const keep = parts.map((p) => p.partNumber);
    await db.storedPart.deleteMany({ where: { key, partNumber: { notIn: keep } } });
    const sum = await db.storedPart.aggregate({ where: { key }, _sum: { size: true } });
    return sum._sum.size ?? 0;
  }

  async abort(key: string) {
    await this.delete(key);
  }

  async delete(key: string) {
    const db = await this.db();
    await db.storedPart.deleteMany({ where: { key } });
  }

  async playbackUrl() {
    return null;
  }

  async open(key: string, range?: { start: number; end: number }) {
    const db = await this.db();
    const index = await db.storedPart.findMany({ where: { key }, select: { partNumber: true, size: true }, orderBy: { partNumber: "asc" } });
    const size = index.reduce((n, p) => n + p.size, 0);
    const start = range?.start ?? 0;
    const end = range?.end ?? size - 1;
    // Parts overlapping [start, end], with each one's offset in the file.
    const wanted: { partNumber: number; offset: number; size: number }[] = [];
    let offset = 0;
    for (const p of index) {
      if (offset + p.size > start && offset <= end) wanted.push({ ...p, offset });
      offset += p.size;
    }
    let i = 0;
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        const p = wanted[i++];
        if (!p) return controller.close();
        const row = await db.storedPart.findUniqueOrThrow({ where: { key_partNumber: { key, partNumber: p.partNumber } }, select: { data: true } });
        const from = Math.max(0, start - p.offset);
        const to = Math.min(p.size, end - p.offset + 1);
        controller.enqueue(new Uint8Array(row.data.subarray(from, to)));
      },
    });
    return { stream, size };
  }
}

let driver: StorageDriver | undefined;

/**
 * S3/R2 when S3_BUCKET is set. Otherwise Postgres on hosts without a
 * writable disk (Vercel) or when STORAGE_DRIVER=db, else local files.
 */
export function storage(): StorageDriver {
  if (!driver) {
    driver = process.env.S3_BUCKET
      ? new S3Driver(process.env.S3_BUCKET)
      : process.env.STORAGE_DRIVER === "db" || (process.env.VERCEL && process.env.STORAGE_DRIVER !== "local")
        ? new DbDriver()
        : new LocalDriver(path.resolve(process.env.LOCAL_STORAGE_DIR ?? ".data/uploads"));
  }
  return driver;
}

/** S3 requires every multipart part except the last to be at least 5 MiB. */
export const MIN_PART_BYTES = 5 * 1024 * 1024;
