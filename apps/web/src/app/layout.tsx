import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: `${BRAND.name}: ${BRAND.tagline}`, template: `%s · ${BRAND.name}` },
  description:
    "Record your screen and camera in the browser or on your phone, and share a link instantly. Crash-proof recording, crisp quality, simple pricing.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
