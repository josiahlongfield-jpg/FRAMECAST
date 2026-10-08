// Mirrors the speech model used for on-device transcripts (AI summaries
// add-on) so SureFrame serves it itself: browsers never fetch it from
// Hugging Face or a CDN at runtime.
//
//   node scripts/mirror-whisper.mjs [revision]
//
// Downloads one exact revision (a commit of onnx-community/whisper-base; the
// current main commit if none is given) into public/models/, and records the
// revision and every file's sha256 in src/lib/ai/whisper-model.json. Browsers
// check each file against those hashes before using it. Commit that JSON.
// Then either deploy with public/models in place, or upload the folder to the
// R2 bucket and set NEXT_PUBLIC_AI_MODEL_BASE to its public URL (ending in
// /models/, with CORS allowing GET from the app's address):
//   aws s3 cp public/models s3://$S3_BUCKET/models --recursive --endpoint-url $S3_ENDPOINT
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = join(root, "src", "lib", "ai", "whisper-model.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const HUB = "https://huggingface.co";
// Encoder and decoder for WebGPU (fp32 + 4-bit) and for the processor-only path (8-bit).
const ONNX = ["onnx/encoder_model.onnx", "onnx/decoder_model_merged_q4.onnx", "onnx/encoder_model_quantized.onnx", "onnx/decoder_model_merged_quantized.onnx"];

const want = process.argv[2] ?? "main";
const info = await (await fetch(`${HUB}/api/models/${manifest.model}/revision/${want}`)).json();
const revision = info.sha;
if (!/^[0-9a-f]{40}$/.test(revision ?? "")) throw new Error(`Couldn't resolve revision ${want}`);
const names = info.siblings.map((s) => s.rfilename).filter((f) => (!f.includes("/") && f.endsWith(".json")) || ONNX.includes(f));
for (const f of ONNX) if (!names.includes(f)) throw new Error(`${f} is missing at ${revision}`);

const files = {};
for (const name of names) {
  const res = await fetch(`${HUB}/${manifest.model}/resolve/${revision}/${name}`);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  const data = Buffer.from(await res.arrayBuffer());
  const out = join(root, "public", "models", manifest.model, revision, name);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, data);
  files[name] = { sha256: createHash("sha256").update(data).digest("hex"), bytes: data.length };
  console.log(`${name}  ${(data.length / 1e6).toFixed(1)} MB`);
}
writeFileSync(manifestPath, JSON.stringify({ model: manifest.model, revision, files }, null, 2) + "\n");
console.log(`Pinned ${manifest.model}@${revision}; manifest written to src/lib/ai/whisper-model.json`);
