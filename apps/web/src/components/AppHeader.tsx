import Link from "next/link";
import { signOut } from "@/auth";
import Logo from "./Logo";

export default function AppHeader({ email, plan }: { email: string; plan: string }) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <Logo href="/library" />
          <nav className="hidden gap-4 text-sm sm:flex">
            <Link href="/library" className="text-slate-600 hover:text-slate-900">Library</Link>
            <Link href="/settings/billing" className="text-slate-600 hover:text-slate-900">Billing</Link>
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 sm:inline">{plan}</span>
          <span className="hidden text-slate-500 md:inline">{email}</span>
          <Link href="/record" className="rounded-lg bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700">New recording</Link>
          <form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }}>
            <button className="text-slate-500 hover:text-slate-900">Sign out</button>
          </form>
        </div>
      </div>
    </header>
  );
}
