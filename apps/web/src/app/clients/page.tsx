import type { Metadata } from "next";
import AppHeader from "@/components/AppHeader";
import ClientsManager from "@/components/ClientsManager";
import { db } from "@/lib/db";
import { clientLink, seatUsage } from "@/lib/clients";
import { EXTRA_SEAT_PRICE, PLANS } from "@/lib/plans";
import { requirePageUser } from "@/lib/session";

export const metadata: Metadata = { title: "Clients" };

export default async function ClientsPage() {
  const { user, workspace } = await requirePageUser("/clients");
  const plan = PLANS[workspace.plan];
  const [clients, seats] = await Promise.all([
    db.client.findMany({
      where: { workspaceId: workspace.id, removedAt: null },
      orderBy: { name: "asc" },
      include: { _count: { select: { videos: true } } },
    }),
    seatUsage(workspace),
  ]);

  return (
    <>
      <AppHeader email={user.email} plan={plan.name} />
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Clients</h1>
        <p className="mt-1 text-sm text-slate-500">
          Clients watch and reply to the videos you send them for free. They don&apos;t need an account, just their personal link.
        </p>
        <ClientsManager
          initialClients={clients.map((c) => ({ id: c.id, name: c.name, email: c.email, link: clientLink(c.token), videoCount: c._count.videos }))}
          initialSeats={seats}
          includedSeats={plan.clientSeats}
          extraSeats={workspace.extraClientSeats}
          seatPrice={EXTRA_SEAT_PRICE}
          canBuySeats={workspace.plan !== "FREE"}
        />
      </main>
    </>
  );
}
