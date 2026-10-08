import type { Metadata } from "next";
import AppHeader from "@/components/AppHeader";
import ClientsManager from "@/components/ClientsManager";
import { db } from "@/lib/db";
import { clientLink, seatUsage } from "@/lib/clients";
import { EXTRA_SEAT_PRICE, PLANS } from "@/lib/plans";
import { requirePageUser } from "@/lib/session";
import { accessOf, clientScopeWhere, effectivePerms } from "@/lib/permissions";

export const metadata: Metadata = { title: "Clients" };

export default async function ClientsPage() {
  const me = await requirePageUser("/clients");
  const { user, workspace, role } = me;
  const access = accessOf(me);
  const perms = effectivePerms(access);
  const plan = PLANS[workspace.plan];
  const [clients, seats, members] = await Promise.all([
    db.client.findMany({
      where: { ...clientScopeWhere(access), removedAt: null },
      orderBy: { name: "asc" },
      include: { _count: { select: { videos: true } } },
    }),
    seatUsage(workspace),
    db.membership.findMany({ where: { workspaceId: workspace.id }, include: { user: true }, orderBy: { id: "asc" } }),
  ]);

  return (
    <>
      <AppHeader email={user.email} plan={plan.name} />
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Clients</h1>
        {!perms.seeAllClients && (
          <p className="mt-1 text-sm text-slate-500">You see the clients assigned to you. The owner or an admin can assign more.</p>
        )}
        <p className="mt-1 text-sm text-slate-500">
          Clients watch and reply to the videos you send them for free. They don&apos;t need an account, just their personal link.
        </p>
        <ClientsManager
          workspaceId={workspace.id}
          fingerprint={workspace.keyFingerprint}
          initialClients={clients.map((c) => ({
            id: c.id,
            name: c.name,
            email: c.email,
            link: clientLink(c.token),
            teamKeyWrap: c.teamKeyWrap,
            videoCount: c._count.videos,
            assignedToId: c.assignedToId,
          }))}
          initialSeats={seats}
          includedSeats={plan.clientSeats}
          extraSeats={workspace.extraClientSeats}
          seatPrice={EXTRA_SEAT_PRICE}
          canBuySeats={workspace.plan !== "FREE"}
          isOwner={role === "OWNER"}
          canManage={role !== "MEMBER"}
          canAdd={perms.addClients}
          seesAll={perms.seeAllClients}
          meId={user.id}
          staff={members.map((m) => ({ id: m.userId, name: m.user.name ?? m.user.email.split("@")[0] }))}
          studioHint={workspace.plan === "SOLO" ? { soloBase: PLANS.SOLO.priceMonthly, studioPrice: PLANS.STUDIO.priceMonthly, studioClients: PLANS.STUDIO.clientSeats } : undefined}
        />
      </main>
    </>
  );
}
