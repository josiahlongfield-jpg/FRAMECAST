import Link from "next/link";
import { BRAND } from "@/lib/brand";
import LogoMark, { Wordmark } from "./LogoMark";

export default function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} aria-label={BRAND.name} className="flex items-center gap-2 text-lg text-slate-900">
      <LogoMark size={30} />
      <Wordmark />
    </Link>
  );
}
