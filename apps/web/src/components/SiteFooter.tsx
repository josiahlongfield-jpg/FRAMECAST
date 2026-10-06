import Link from "next/link";
import { BRAND } from "@/lib/brand";

export default function SiteFooter() {
  return (
    <footer className="border-t border-slate-100 py-10 text-sm text-slate-500">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6">
        <p>© {new Date().getFullYear()} {BRAND.name}. All rights reserved.</p>
        <nav className="flex gap-6">
          <Link href="/pricing" className="hover:text-slate-900">Pricing</Link>
          <Link href="/legal/privacy" className="hover:text-slate-900">Privacy</Link>
          <Link href="/legal/terms" className="hover:text-slate-900">Terms</Link>
        </nav>
      </div>
    </footer>
  );
}
