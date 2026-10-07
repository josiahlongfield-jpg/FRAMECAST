import { z } from "zod";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/session";

/**
 * Sent with anything the browser sealed using the team key (directly, or via
 * a client key it unwrapped). If the team's keys were reset after this page
 * loaded, the write would be unreadable, so it is refused instead.
 */
export const KeyFingerprint = z.string().min(16).max(64).optional();

export const STALE_KEY = "Your team's encryption keys just changed. Reload the page and try again.";

export async function requireCurrentKey(workspace: string | { keyFingerprint: string | null }, fingerprint: string | undefined) {
  if (!fingerprint) return;
  const current = typeof workspace === "string" ? (await db.workspace.findUnique({ where: { id: workspace }, select: { keyFingerprint: true } }))?.keyFingerprint : workspace.keyFingerprint;
  if (current && current !== fingerprint) throw new HttpError(409, STALE_KEY);
}

/** Rotations as served to a device: follow `from` → `wrap` until the current key. */
export const rotationDTO = (r: { fromFingerprint: string; wrap: string }) => ({ from: r.fromFingerprint, wrap: r.wrap });
