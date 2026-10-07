import Link from "next/link";
import { signOut } from "@/auth";
import Logo from "./Logo";

const LINKS = [
  ["/library", "Library"],
  ["/clients", "Clients"],
  ["/settings/team", "Team"],
  ["/settings/reminders", "Reminders"],
  ["/settings/branding", "Branding"],
  ["/settings/billing", "Billing"],
  ["/settings/account", "Account"],
] as const;

export default function AppHeader({ email, plan }: { email: string; plan: string }) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <Logo href="/library" />
          <nav className="hidden gap-4 text-sm sm:flex">
            {LINKS.map(([href, label]) => (
              <Link key={href} href={href} className="text-slate-600 hover:text-slate-900">{label}</Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 sm:inline">{plan}</span>
          <span className="hidden text-slate-500 2xl:inline">{email}</span>
          <Link href="/record" className="rounded-lg bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700">
            <span className="sm:hidden">Record</span>
            <span className="hidden sm:inline">New recording</span>
          </Link>
          <form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }}>
            <button className="whitespace-nowrap text-slate-500 hover:text-slate-900">Sign out</button>
          </form>
        </div>
      </div>
      {/* On phones the links get their own row so the top bar never squeezes. */}
      <nav className="flex gap-1 overflow-x-auto border-t border-slate-100 px-2 text-sm sm:hidden">
        {LINKS.map(([href, label]) => (
          <Link key={href} href={href} className="shrink-0 px-3 py-2.5 text-slate-600 hover:text-slate-900">{label}</Link>
        ))}
      </nav>
    </header>
  );
}
