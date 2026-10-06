import { db } from "@/lib/db";

/** A business's logo, shown to its clients on pages and in emails. Versioned URLs, so cache forever. */
export async function GET(_req: Request, ctx: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await ctx.params;
  const w = await db.workspace.findUnique({ where: { id: workspaceId }, select: { brandLogo: true, brandLogoType: true } });
  if (!w?.brandLogo || !w.brandLogoType) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(w.brandLogo), {
    headers: {
      "Content-Type": w.brandLogoType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
