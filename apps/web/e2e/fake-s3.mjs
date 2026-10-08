// A small stand-in for an S3/R2 bucket (path-style), so storage can be tested
// with S3_BUCKET set and no cloud account. Start the app with
//   S3_BUCKET=fc-test S3_ENDPOINT=http://localhost:12114 S3_REGION=auto
//   AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test
// Handles objects, multipart uploads (including presigned part uploads from
// the browser), ranges, and the bucket CORS rule from the README (only the
// app's own origin; no CORS headers for anyone else). Signatures aren't
// checked. Objects live in memory; `log` records every request in order.
import { createServer } from "node:http";
import { createHash } from "node:crypto";

export const objects = new Map(); // key -> { body, type }
export const log = []; // { method, key, query }
const uploads = new Map(); // uploadId -> { key, type, parts: Map<number, Buffer> }
const xml = (res, status, body) => {
  res.writeHead(status, { ...res.cors, "Content-Type": "application/xml" });
  res.end(`<?xml version="1.0" encoding="UTF-8"?>\n${body}`);
};
const error = (res, status, code) => xml(res, status, `<Error><Code>${code}</Code><Message>${code}</Message></Error>`);
const etag = (b) => `"${createHash("md5").update(b).digest("hex")}"`;

/** Undoes aws-chunked encoding (the SDK's streaming uploads with trailing checksums). */
function unchunk(buf) {
  const out = [];
  let at = 0;
  for (;;) {
    const eol = buf.indexOf("\r\n", at);
    const size = parseInt(buf.subarray(at, eol).toString().split(";")[0], 16);
    if (!size) break;
    out.push(buf.subarray(eol + 2, eol + 2 + size));
    at = eol + 2 + size + 2;
  }
  return Buffer.concat(out);
}

export function startFakeS3({ port = 12114, bucket = "fc-test", origins = ["http://localhost:3000"] } = {}) {
  const server = createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const url = new URL(req.url, `http://localhost:${port}`);
      const origin = req.headers.origin;
      res.cors =
        origin && origins.includes(origin)
          ? { "Access-Control-Allow-Origin": origin, "Access-Control-Expose-Headers": "ETag", Vary: "Origin" }
          : {};
      if (req.method === "OPTIONS") {
        const allowed = origin && origins.includes(origin) && ["GET", "PUT", "HEAD"].includes(req.headers["access-control-request-method"]);
        res.writeHead(allowed ? 200 : 403, allowed ? { ...res.cors, "Access-Control-Allow-Methods": "GET, PUT, HEAD", "Access-Control-Allow-Headers": req.headers["access-control-request-headers"] ?? "*", "Access-Control-Max-Age": "3600" } : {});
        return res.end();
      }
      const [, b, ...rest] = url.pathname.split("/");
      const key = decodeURIComponent(rest.join("/"));
      const q = url.searchParams;
      log.push({ method: req.method, key, query: [...q.keys()].filter((k) => !k.startsWith("X-Amz-") && !k.startsWith("x-id")).join(",") });
      if (b !== bucket) return error(res, 404, "NoSuchBucket");
      let body = Buffer.concat(chunks);
      if (/aws-chunked/.test(req.headers["content-encoding"] ?? "") || /^STREAMING-/.test(req.headers["x-amz-content-sha256"] ?? "")) body = unchunk(body);

      if (req.method === "POST" && q.has("uploads")) {
        const id = `up${Math.random().toString(36).slice(2)}`;
        uploads.set(id, { key, type: req.headers["content-type"], parts: new Map() });
        return xml(res, 200, `<InitiateMultipartUploadResult><Bucket>${bucket}</Bucket><Key>${key}</Key><UploadId>${id}</UploadId></InitiateMultipartUploadResult>`);
      }
      if (q.has("uploadId")) {
        const up = uploads.get(q.get("uploadId"));
        if (!up) return error(res, 404, "NoSuchUpload");
        if (req.method === "PUT") {
          up.parts.set(Number(q.get("partNumber")), body);
          res.writeHead(200, { ...res.cors, ETag: etag(body) });
          return res.end();
        }
        if (req.method === "GET") {
          const parts = [...up.parts].sort((x, y) => x[0] - y[0]).map(([n, p]) => `<Part><PartNumber>${n}</PartNumber><ETag>${etag(p)}</ETag><Size>${p.length}</Size></Part>`);
          return xml(res, 200, `<ListPartsResult><Bucket>${bucket}</Bucket><Key>${key}</Key><UploadId>${q.get("uploadId")}</UploadId><IsTruncated>false</IsTruncated>${parts.join("")}</ListPartsResult>`);
        }
        if (req.method === "POST") {
          const wanted = [...body.toString().matchAll(/<PartNumber>(\d+)<\/PartNumber>/g)].map((m) => Number(m[1]));
          // Like R2: every part except the last must be the same size.
          const sizes = wanted.slice(0, -1).map((n) => up.parts.get(n)?.length ?? 0);
          if (sizes.some((n) => n !== sizes[0])) return xml(res, 400, "<Error><Code>InvalidPart</Code><Message>All non-trailing parts must have the same length.</Message></Error>");
          const data = Buffer.concat(wanted.map((n) => up.parts.get(n) ?? Buffer.alloc(0)));
          objects.set(key, { body: data, type: up.type });
          uploads.delete(q.get("uploadId"));
          return xml(res, 200, `<CompleteMultipartUploadResult><Bucket>${bucket}</Bucket><Key>${key}</Key><ETag>${etag(data)}</ETag></CompleteMultipartUploadResult>`);
        }
        if (req.method === "DELETE") {
          uploads.delete(q.get("uploadId"));
          res.writeHead(204, res.cors);
          return res.end();
        }
      }
      if (req.method === "PUT") {
        objects.set(key, { body, type: req.headers["content-type"] });
        res.writeHead(200, { ...res.cors, ETag: etag(body) });
        return res.end();
      }
      if (req.method === "DELETE") {
        objects.delete(key);
        res.writeHead(204, res.cors);
        return res.end();
      }
      if (req.method === "GET" || req.method === "HEAD") {
        const obj = objects.get(key);
        if (!obj) return error(res, 404, "NoSuchKey");
        const headers = { ...res.cors, "Content-Type": obj.type ?? "application/octet-stream", ETag: etag(obj.body), "Accept-Ranges": "bytes" };
        const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/);
        if (range) {
          const size = obj.body.length;
          const start = range[1] ? Number(range[1]) : size - Number(range[2]);
          const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
          res.writeHead(206, { ...headers, "Content-Length": end - start + 1, "Content-Range": `bytes ${start}-${end}/${size}` });
          return res.end(req.method === "HEAD" ? undefined : obj.body.subarray(start, end + 1));
        }
        res.writeHead(200, { ...headers, "Content-Length": obj.body.length });
        return res.end(req.method === "HEAD" ? undefined : obj.body);
      }
      error(res, 400, "NotImplemented");
    });
  });
  return new Promise((r) => server.listen(port, () => r(server)));
}
