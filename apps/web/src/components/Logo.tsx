import Link from "next/link";
import { BRAND } from "@/lib/brand";

export default function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 font-semibold tracking-tight text-slate-900">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M8 5.5v13l11-6.5z" /></svg>
      </span>
      {BRAND.name}
    </Link>
  );
}
