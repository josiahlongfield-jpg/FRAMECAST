import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/stripe";

/** Only the marketing pages are public; videos, client links and the app are private. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/pricing", "/legal/"],
      disallow: ["/v/", "/c/", "/inbox", "/api/", "/settings", "/library", "/clients", "/record", "/login", "/reminders", "/mobile"],
    },
    sitemap: appUrl("/sitemap.xml"),
  };
}
