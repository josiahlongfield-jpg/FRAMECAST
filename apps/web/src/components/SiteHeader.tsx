import Link from "next/link";
import { auth } from "@/auth";
import Logo from "./Logo";

export default async function SiteHeader() {
  const signedIn = !!(await auth())?.user;
  return (
    <header className="sticky top-0 z-20 border-b border-slate-100 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo />
        <nav className="flex items-center gap-1 text-sm sm:gap-4">
          {/* Left to the footer on the narrowest phones (under 360px), so the bar never scrolls sideways. */}
          <Link href="/pricing" className="whitespace-nowrap rounded-lg px-2 py-2 text-slate-600 hover:text-slate-900 max-[359px]:hidden sm:px-3">Pricing</Link>
          {signedIn ? (
            <Link href="/library" className="whitespace-nowrap rounded-lg px-2 py-2 text-slate-600 hover:text-slate-900 sm:px-3">Library</Link>
          ) : (
            <Link href="/login" className="whitespace-nowrap rounded-lg px-2 py-2 text-slate-600 hover:text-slate-900 sm:px-3">Sign in</Link>
          )}
          {/* Short on phones, as in the app's header, so the bar fits a 360px screen. */}
          <Link href="/record" className="whitespace-nowrap rounded-lg bg-brand-600 px-3 py-2 font-medium text-white hover:bg-brand-700 sm:px-4">
            <span className="sm:hidden">Record</span>
            <span className="hidden sm:inline">Start recording</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
