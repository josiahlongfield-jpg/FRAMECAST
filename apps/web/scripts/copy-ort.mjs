// Serves the ONNX runtime (used for on-device transcription in the AI
// summaries add-on) from our own site instead of a public CDN, so the code
// that handles decrypted audio comes from us. Runs after npm install.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules", "onnxruntime-web", "dist");
const to = join(root, "public", "ort");
const files = ["ort-wasm-simd-threaded.asyncify.mjs", "ort-wasm-simd-threaded.asyncify.wasm", "ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"];

if (!existsSync(from)) {
  console.warn("copy-ort: onnxruntime-web not installed; skipping");
} else {
  mkdirSync(to, { recursive: true });
  for (const f of files) copyFileSync(join(from, f), join(to, f));
  console.log(`copy-ort: copied ${files.length} files to public/ort`);
}
