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

let driver: StorageDriver | undefined;

export function storage(): StorageDriver {
  if (!driver) {
    driver = process.env.S3_BUCKET
      ? new S3Driver(process.env.S3_BUCKET)
      : new LocalDriver(path.resolve(process.env.LOCAL_STORAGE_DIR ?? ".data/uploads"));
  }
  return driver;
}

/** S3 requires every multipart part except the last to be at least 5 MiB. */
export const MIN_PART_BYTES = 5 * 1024 * 1024;
