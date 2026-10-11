import { z } from "zod";
import { handle, HttpError } from "@/lib/session";
import {
  blockEmail,
  closeAccount,
  disableClientLink,
  enableClientLink,
  NOTICE_REASONS,
  reopenAccount,
  requireSupportAdmin,
  setLegalHold,
  signOutEverywhere,
  suspendUser,
  suspendWorkspace,
  unblockEmail,
  unsuspendUser,
  unsuspendWorkspace,
  warn,
  type NoticeReason,
} from "@/lib/support/admin";

const id = z.string().min(1).max(64);
const reason = z.string().max(2000);
const category = z.enum(Object.keys(NOTICE_REASONS) as [NoticeReason, ...NoticeReason[]]);
const notify = z.boolean().optional();

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("warn"), workspaceId: id.optional(), userId: id.optional(), reason, category, message: z.string().max(2000).nullish() }),
  z.object({ action: z.literal("suspendWorkspace"), workspaceId: id, reason, category, note: z.string().max(2000).nullish(), notify, stopRenewal: z.boolean().optional() }),
  z.object({ action: z.literal("unsuspendWorkspace"), workspaceId: id, reason, notify, resumeRenewal: z.boolean().optional() }),
  z.object({ action: z.literal("suspendUser"), userId: id, reason, category, notify }),
  z.object({ action: z.literal("unsuspendUser"), userId: id, reason, notify }),
  z.object({
    action: z.literal("closeAccount"),
    userId: id,
    reason,
    category,
    confirm: z.string().max(400),
    notify,
    blockEmail: z.boolean().optional(),
    legalHold: z.boolean().optional(),
  }),
  z.object({ action: z.literal("reopenAccount"), userId: id, reason, notify }),
  z.object({ action: z.literal("setLegalHold"), workspaceId: id, on: z.boolean(), reason }),
  z.object({ action: z.literal("disableClientLink"), clientId: id, reason, category, notify }),
  z.object({ action: z.literal("enableClientLink"), clientId: id, reason, notify }),
  z.object({ action: z.literal("signOutEverywhere"), userId: id, reason, category: category.optional(), notify }),
  z.object({ action: z.literal("blockEmail"), email: z.string().max(320), reason, category: category.optional(), notify }),
  z.object({ action: z.literal("unblockEmail"), email: z.string().max(320), reason }),
]);

/**
 * The support powers (lib/support/admin.ts) as one JSON endpoint, for the
 * support console and tests. Support admins only; everyone else gets a 404.
 * Only same-site JSON requests are accepted, so another site can't post a
 * form here with an admin's cookies.
 */
export const POST = handle(async (req: Request) => {
  const site = req.headers.get("sec-fetch-site");
  if ((site && site !== "same-origin" && site !== "none") || !req.headers.get("content-type")?.startsWith("application/json")) {
    throw new HttpError(403, "Forbidden");
  }
  const admin = await requireSupportAdmin();
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid request");
  const b = parsed.data;
  switch (b.action) {
    case "warn":
      return Response.json(await warn(admin, b));
    case "suspendWorkspace":
      return Response.json(await suspendWorkspace(admin, b));
    case "unsuspendWorkspace":
      return Response.json(await unsuspendWorkspace(admin, b));
    case "suspendUser":
      return Response.json(await suspendUser(admin, b));
    case "unsuspendUser":
      return Response.json(await unsuspendUser(admin, b));
    case "closeAccount":
      return Response.json(await closeAccount(admin, b));
    case "reopenAccount":
      return Response.json(await reopenAccount(admin, b));
    case "setLegalHold":
      return Response.json(await setLegalHold(admin, b));
    case "disableClientLink":
      return Response.json(await disableClientLink(admin, b));
    case "enableClientLink":
      return Response.json(await enableClientLink(admin, b));
    case "signOutEverywhere":
      return Response.json(await signOutEverywhere(admin, b));
    case "blockEmail":
      return Response.json(await blockEmail(admin, b));
    case "unblockEmail":
      return Response.json(await unblockEmail(admin, b));
  }
});
