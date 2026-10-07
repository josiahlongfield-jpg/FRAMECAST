import type { NextConfig } from "next";

// On Vercel without an S3 bucket, video parts go through a function whose
// request body limit is 4.5 MB, so keep parts well under it (a part can run
// one recording chunk over this size).
const smallParts = !!process.env.VERCEL && !process.env.S3_BUCKET;

// Applied to every response. Client keys travel only in URL fragments, which
// browsers never send anywhere, and "same-origin" keeps paths out of other sites' logs.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), display-capture=(self), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  env: {
    // With a bucket, browsers upload parts straight to it via presigned URLs.
    NEXT_PUBLIC_DIRECT_UPLOADS: process.env.S3_BUCKET && process.env.DIRECT_UPLOADS !== "off" ? "1" : "",
    NEXT_PUBLIC_UPLOAD_PART_BYTES: process.env.NEXT_PUBLIC_UPLOAD_PART_BYTES ?? (smallParts ? String(2 * 1024 * 1024) : ""),
  },
};

export default nextConfig;
