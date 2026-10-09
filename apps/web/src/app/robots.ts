import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/stripe";

/** Only the marketing pages are public; videos, client links and the app are private. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/pricing", "/help", "/legal/"],
      disallow: ["/v/", "/c/", "/inbox", "/api/", "/settings", "/library", "/clients", "/record", "/login", "/reminders", "/mobile", "/team", "/support", "/join", "/models"],
    },
    sitemap: appUrl("/sitemap.xml"),
  };
}
