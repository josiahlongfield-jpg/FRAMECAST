import { auth } from "@/auth";
import { storage, storageKind } from "@/lib/storage";
import { fileKey, readManifest } from "@/lib/ai/speechModel";
import { rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Presigned links live this long; a download only has to start before then. */
const LINK_SECONDS = 15 * 60;
// Never cache the redirect itself (the link inside expires). Devices keep the
// verified files themselves, keyed on these stable /models URLs.
const noStore = { "Cache-Control": "no-store" };

/**
 * The self-hosted speech model for on-device transcripts. Only the installed
 * manifest and the files it lists are served; each file is a redirect to a
 * short-lived link straight to our storage bucket, so the bytes don't pass
 * through our servers. Only signed-in members download it (transcripts are
 * made on their devices), and each is limited per hour so the files can't be
 * pulled over and over at our cost.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const userId = (await auth())?.user?.id;
  if (!userId) return new Response("Sign in required", { status: 401, headers: noStore });
  if (!(await rateLimit(`models:${userId}`, 300, 3600).then(() => true, () => false))) {
    return new Response("Too many requests", { status: 429, headers: noStore });
  }
  const rel = (await ctx.params).path.join("/");
  const manifest = await readManifest();
  if (!manifest) return new Response("Not found", { status: 404, headers: noStore });
  if (rel === "manifest.json") return Response.json(manifest, { headers: noStore });

  const prefix = `${manifest.model}/${manifest.revision}/`;
  const name = rel.startsWith(prefix) ? rel.slice(prefix.length) : null;
  if (!name || !Object.hasOwn(manifest.files, name)) return new Response("Not found", { status: 404, headers: noStore });

  const key = fileKey(manifest.model, manifest.revision, name);
  const driver = storage();
  const remote = await driver.playbackUrl(key, LINK_SECONDS);
  if (remote) return new Response(null, { status: 302, headers: { Location: remote, ...noStore } });
  // Local development without a bucket: stream the file.
  if (storageKind() !== "local" || !driver.open) return new Response("Not found", { status: 404, headers: noStore });
  const { stream, size } = await driver.open(key);
  return new Response(stream, { headers: { "Content-Type": "application/octet-stream", "Content-Length": String(size), ...noStore } });
}
