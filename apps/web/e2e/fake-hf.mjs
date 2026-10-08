// A stand-in for the Hugging Face Hub so the speech-model install can be
// tested offline. Start the app with HF_BASE_URL=http://localhost:12113
// (honoured outside production only). Serves a small made-up
// onnx-community/whisper-base at one revision: the JSON files, the four ONNX
// files the app copies (one bigger than an upload part), and some files it
// must skip. Downloads go through a redirect, like the real Hub's CDN.
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";

export const MODEL = "onnx-community/whisper-base";
export const REVISION = "0123456789abcdef0123456789abcdef01234567";
const json = (o) => Buffer.from(JSON.stringify(o));

export const files = {
  "config.json": json({ model_type: "whisper", fake: true }),
  "generation_config.json": json({ fake: true }),
  "preprocessor_config.json": json({ fake: true }),
  "tokenizer.json": json({ fake: true }),
  "tokenizer_config.json": json({ fake: true }),
  "onnx/encoder_model.onnx": randomBytes(18 * 1024 * 1024), // more than one 16 MiB upload part
  "onnx/decoder_model_merged_q4.onnx": randomBytes(300_000),
  "onnx/encoder_model_quantized.onnx": randomBytes(200_000),
  "onnx/decoder_model_merged_quantized.onnx": randomBytes(400_000),
};
/** Present upstream but not used by the app, so never copied. */
const skipped = { "README.md": Buffer.from("# fake"), "onnx/encoder_model_fp16.onnx": randomBytes(1000), ".gitattributes": Buffer.from("*") };
export const sha256 = (b) => createHash("sha256").update(b).digest("hex");
export const requests = [];

export function startFakeHf(port = 12113) {
  const all = { ...files, ...skipped };
  const server = createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    requests.push(url.pathname);
    if (url.pathname === `/api/models/${MODEL}/revision/main` || url.pathname === `/api/models/${MODEL}/revision/${REVISION}`) {
      const siblings = Object.entries(all).map(([rfilename, b]) =>
        rfilename.endsWith(".onnx") ? { rfilename, size: b.length, lfs: { sha256: sha256(b), size: b.length, pointerSize: 134 } } : { rfilename, size: b.length },
      );
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ id: MODEL, sha: REVISION, siblings }));
    }
    const resolve = `/${MODEL}/resolve/${REVISION}/`;
    if (url.pathname.startsWith(resolve) && all[url.pathname.slice(resolve.length)]) {
      res.writeHead(302, { Location: `/cdn/${url.pathname.slice(resolve.length)}` });
      return res.end();
    }
    const cdn = url.pathname.startsWith("/cdn/") ? all[url.pathname.slice(5)] : null;
    if (cdn) {
      res.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Length": cdn.length });
      return res.end(cdn);
    }
    res.writeHead(404);
    res.end("not found");
  });
  return new Promise((r) => server.listen(port, () => r(server)));
}
