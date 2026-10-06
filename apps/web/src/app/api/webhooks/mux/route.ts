import crypto from "node:crypto";
import { handleMuxEvent } from "@/lib/transcode";

function verify(raw: string, header: string | null) {
  const secret = process.env.MUX_WEBHOOK_SECRET;
  if (!secret) return false;
  const parts = Object.fromEntries((header ?? "").split(",").map((kv) => kv.split("=") as [string, string]));
  if (!parts.t || !parts.v1) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${parts.t}.${raw}`).digest("hex");
  return expected.length === parts.v1.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verify(raw, req.headers.get("mux-signature"))) return new Response("Bad signature", { status: 400 });
  await handleMuxEvent(JSON.parse(raw));
  return new Response("ok");
}
