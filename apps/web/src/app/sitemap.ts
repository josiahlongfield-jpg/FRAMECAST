import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/stripe";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/pricing", "/legal/terms", "/legal/privacy"].map((p) => ({ url: appUrl(p), changeFrequency: "monthly" }));
}
