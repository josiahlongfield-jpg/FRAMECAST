import type { Metadata } from "next";
import BrandPreviewFrame from "./BrandPreviewFrame";
import { brandOf } from "@/lib/branding";
import { requirePageUser } from "@/lib/session";
import type { PreviewView } from "@/components/ClientPreview";

export const metadata: Metadata = { title: "Client preview", robots: { index: false } };

/**
 * The client pages with this workspace's branding, framed by the branding
 * settings page at real phone and desktop widths. Starts with the saved
 * branding; the settings page sends unsaved changes as they're made.
 */
export default async function BrandingPreview({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { user, workspace } = await requirePageUser("/settings/branding");
  const { view } = await searchParams;
  const brand = brandOf({ ...workspace, plan: "SOLO" });
  const sender = user.name?.trim().split(/\s+/)[0] || "Sam";
  return <BrandPreviewFrame initial={brand} sender={sender} view={view === "inbox" || view === "email" ? (view as PreviewView) : "video"} />;
}
