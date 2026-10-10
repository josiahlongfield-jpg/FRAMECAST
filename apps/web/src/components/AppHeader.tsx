import Link from "next/link";
import { signOut } from "@/auth";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import NamePrompt from "./NamePrompt";
import StaffNotices from "./StaffNotices";
import Logo from "./Logo";
import MobileMenu from "./MobileMenu";
import NavLinks from "./NavLinks";
import SupportWidget from "./SupportChat";

const LINKS = [
  ["/library", "Library"],
  ["/clients", "Clients"],
  ["/settings/team", "Team"],
  ["/settings/reminders", "Reminders"],
  ["/settings/branding", "Branding"],
  ["/settings/billing", "Billing"],
  ["/settings/account", "Account"],
] as const;

export default async function AppHeader({ email, plan }: { email: string; plan: string }) {
  const me = await currentUser();
  const named = !me || !!me.user.name;
  // Owners and admins get the Team overview; everyone gets reminders sent to them.
  const links = me && me.role !== "MEMBER" ? [LINKS[0], LINKS[1], ["/team", "Overview"] as const, ...LINKS.slice(2)] : LINKS;
  const notices = me
    ? await db.staffNotice.findMany({ where: { toUserId: me.user.id, workspaceId: me.workspace.id, dismissedAt: null }, include: { from: { select: { name: true, email: true } } }, orderBy: { createdAt: "desc" }, take: 5 })
    : [];
  const signOutForm = (
    <form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }}>
      <button className="whitespace-nowrap text-slate-500 hover:text-slate-900">Sign out</button>
    </form>
  );
  return (
    <header className="relative border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <Logo href="/library" />
          <nav className="hidden gap-4 text-sm lg:flex">
            <NavLinks links={links} className="" />
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 lg:inline">{plan}</span>
          <span className="hidden text-slate-500 2xl:inline">{email}</span>
          <Link href="/record" className="rounded-lg bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700">
            <span className="sm:hidden">Record</span>
            <span className="hidden sm:inline">New recording</span>
          </Link>
          <div className="hidden lg:block">{signOutForm}</div>
          {/* Phones and small screens: everything else sits behind one Menu button. */}
          <MobileMenu links={links} plan={plan} email={email} signOut={signOutForm} />
        </div>
      </div>
      <StaffNotices
        initial={notices.map((n) => ({ id: n.id, from: n.from.name ?? n.from.email.split("@")[0], message: n.message, link: n.link, linkLabel: n.linkLabel, createdAt: n.createdAt.toISOString() }))}
      />
      {!named && <NamePrompt />}
      <SupportWidget signedIn />
    </header>
  );
}
