// The speech model's manifest, shared by the server (which writes it when the
// founder installs the model) and the browser (which checks every model file
// against it). Served at /models/manifest.json.

export const SPEECH_MODEL = "onnx-community/whisper-base";

export type ModelFile = { sha256: string; bytes: number };
export type ModelManifest = {
  model: string;
  /** The exact Hugging Face commit the files were copied from. */
  revision: string;
  /** Path inside the model (e.g. "config.json", "onnx/encoder_model.onnx") → its hash and size. */
  files: Record<string, ModelFile>;
  installedAt: string;
};

/** The model files a device needs, by how it runs the model (the JSON files are always needed). */
export const ONNX_FOR = {
  webgpu: ["onnx/encoder_model.onnx", "onnx/decoder_model_merged_q4.onnx"],
  wasm: ["onnx/encoder_model_quantized.onnx", "onnx/decoder_model_merged_quantized.onnx"],
} as const;

/** Every ONNX file copied on install: both sets above. */
export const ONNX_FILES: readonly string[] = [...ONNX_FOR.webgpu, ...ONNX_FOR.wasm];

/** Loose check of a manifest read from storage or the network. */
export function isManifest(m: unknown): m is ModelManifest {
  const x = m as ModelManifest;
  return (
    !!x &&
    typeof x.model === "string" &&
    /^[0-9a-f]{40}$/.test(x.revision) &&
    !!x.files &&
    typeof x.files === "object" &&
    Object.values(x.files).every((f) => /^[0-9a-f]{64}$/.test(f?.sha256) && Number.isSafeInteger(f?.bytes))
  );
}
