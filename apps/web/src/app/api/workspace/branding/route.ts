import { db } from "@/lib/db";
import { colorProblem, LOGO_TYPES, MAX_LOGO_BYTES } from "@/lib/branding";
import { limitByIp } from "@/lib/rateLimit";
import { handle, HttpError, requireUser } from "@/lib/session";

/** Save custom branding: multipart form with optional `logo` file, `color`, and `removeLogo`. */
export const POST = handle(async (req: Request) => {
  const { user, workspace } = await requireUser();
  if (workspace.plan === "FREE") throw new HttpError(402, "Custom branding is part of Pro and Business.");
  const member = await db.membership.findFirst({ where: { userId: user.id, workspaceId: workspace.id } });
  if (member?.role === "MEMBER") throw new HttpError(403, "Only owners and admins can change branding.");

  const form = await req.formData();
  await limitByIp("branding", 30, 600);
  const data: { brandColor?: string | null; brandLogo?: Uint8Array<ArrayBuffer> | null; brandLogoType?: string | null } = {};

  const color = String(form.get("color") ?? "").trim().toLowerCase();
  if (color) {
    const problem = colorProblem(color);
    if (problem) throw new HttpError(400, problem);
    data.brandColor = color;
  } else if (form.has("color")) data.brandColor = null;

  const logo = form.get("logo");
  if (logo instanceof File && logo.size > 0) {
    if (!(LOGO_TYPES as readonly string[]).includes(logo.type)) throw new HttpError(400, "Upload a PNG, JPG or WebP image.");
    if (logo.size > MAX_LOGO_BYTES) throw new HttpError(413, "That image is too big. Use one under 300 KB.");
    data.brandLogo = new Uint8Array(await logo.arrayBuffer());
    data.brandLogoType = logo.type;
  } else if (form.get("removeLogo") === "1") {
    data.brandLogo = null;
    data.brandLogoType = null;
  }

  const w = await db.workspace.update({
    where: { id: workspace.id },
    data: { ...data, brandVersion: { increment: 1 } },
    select: { brandColor: true, brandLogoType: true, brandVersion: true },
  });
  return Response.json({ color: w.brandColor, hasLogo: !!w.brandLogoType, version: w.brandVersion });
});
