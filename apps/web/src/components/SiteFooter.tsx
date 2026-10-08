import Link from "next/link";
import { auth } from "@/auth";
import { BRAND } from "@/lib/brand";
import { LEGAL } from "@/lib/legal";
import SupportWidget from "./SupportChat";

export default async function SiteFooter() {
  const signedIn = !!(await auth())?.user;
  return (
    <footer className="border-t border-slate-100 py-10 text-sm text-slate-500">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6">
        <p>© {new Date().getFullYear()} {BRAND.name}. All rights reserved.{LEGAL.abn && ` ABN ${LEGAL.abn}`}</p>
        <nav className="flex gap-6">
          <Link href="/pricing" className="hover:text-slate-900">Pricing</Link>
          <Link href="/help" className="hover:text-slate-900">Help</Link>
          <Link href="/legal/privacy" className="hover:text-slate-900">Privacy</Link>
          <Link href="/legal/terms" className="hover:text-slate-900">Terms</Link>
        </nav>
      </div>
      <SupportWidget signedIn={signedIn} />
    </footer>
  );
}
