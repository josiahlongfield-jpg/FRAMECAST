import type { NextConfig } from "next";

// On Vercel without an S3 bucket, video parts go through a function whose
// request body limit is 4.5 MB, so keep parts well under it (a part can run
// one recording chunk over this size).
const smallParts = !!process.env.VERCEL && !process.env.S3_BUCKET;

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_UPLOAD_PART_BYTES: process.env.NEXT_PUBLIC_UPLOAD_PART_BYTES ?? (smallParts ? String(2 * 1024 * 1024) : ""),
  },
};

export default nextConfig;
