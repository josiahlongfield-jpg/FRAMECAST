import { LOGO_TYPES, MAX_LOGO_BYTES } from "@/lib/branding";

/** Logos are shown at most 32-40px tall, so this is plenty even on sharp screens. */
const MAX_W = 800;
const MAX_H = 320;

export type PreparedLogo = { file: File; dataUrl: string; resized: boolean };

const readAsDataUrl = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });

function load(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("unreadable"));
    img.src = src;
  });
}

/**
 * Turn whatever image someone picks into a logo the server accepts: PNG, JPG
 * or WebP under 300 KB. Big photos and high-resolution logos are scaled down
 * in the browser, and SVG or GIF logos are converted to PNG, so a typical logo
 * file just works instead of being refused.
 */
export async function prepareLogo(f: File): Promise<PreparedLogo | { error: string }> {
  if (!f.type.startsWith("image/")) return { error: "That isn't an image. Upload a PNG, JPG, WebP or SVG logo." };
  const accepted = (LOGO_TYPES as readonly string[]).includes(f.type);
  const url = URL.createObjectURL(f);
  let img: HTMLImageElement;
  try {
    img = await load(url);
  } catch {
    URL.revokeObjectURL(url);
    return { error: "Couldn't read that image. Save it as a PNG or JPG and try again." };
  }
  // SVGs without a size report 0x0 in some browsers; give them a sensible one.
  const w0 = img.naturalWidth || 600;
  const h0 = img.naturalHeight || 200;
  if (accepted && f.size <= MAX_LOGO_BYTES && w0 <= MAX_W * 1.5 && h0 <= MAX_H * 1.5) {
    URL.revokeObjectURL(url);
    return { file: f, dataUrl: await readAsDataUrl(f), resized: false };
  }

  const scale = Math.min(1, MAX_W / w0, MAX_H / h0);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w0 * scale));
  canvas.height = Math.max(1, Math.round(h0 * scale));
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(url);
  const toBlob = (type: string, q?: number) => new Promise<Blob | null>((r) => canvas.toBlob(r, type, q));
  // PNG keeps transparent backgrounds; WebP is the smaller fallback that still does.
  let blob = await toBlob("image/png");
  if (!blob || blob.size > MAX_LOGO_BYTES) blob = await toBlob("image/webp", 0.9);
  if (!blob || (blob.type !== "image/webp" && blob.type !== "image/png") || blob.size > MAX_LOGO_BYTES) {
    return { error: "That image is too detailed to use as a logo. Try a simpler PNG or JPG under 300 KB." };
  }
  const name = f.name.replace(/\.[^.]+$/, "") + (blob.type === "image/png" ? ".png" : ".webp");
  const file = new File([blob], name, { type: blob.type });
  return { file, dataUrl: await readAsDataUrl(file), resized: true };
}
