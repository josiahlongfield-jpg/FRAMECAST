"use client";

import Link from "next/link";
import { useState } from "react";
import { exportKey, fingerprint, generateKey, unwrapKey, wrapKey } from "@/lib/e2e/crypto";
import TeamKeyGate from "./TeamKeyGate";

type Seats = { used: number; limit: number };
type Client = { id: string; name: string; email: string | null; link: string; teamKeyWrap: string | null; videoCount: number; assignedToId: string | null };
type Staff = { id: string; name: string };

/** US$37.50, US$45 */
const money = (n: number) => `US$${Number.isInteger(n) ? n : n.toFixed(2)}`;

/** A client's personal link, with their decryption key in the #fragment (never sent to the server). */
export async function personalLink(link: string, teamKeyWrap: string | null, teamKey: CryptoKey) {
  if (!teamKeyWrap) return link;
  const clientKey = await unwrapKey(teamKeyWrap, teamKey);
  return `${link}#k=${await exportKey(clientKey)}`;
}

/** Remembers that the team copied a client's link to send it, so new videos get a plain Send. */
export function markLinkSent(clientId: string) {
  return fetch(`/api/clients/${clientId}/link-sent`, { method: "POST" }).catch(() => {});
}

type Props = {
  workspaceId: string;
  fingerprint: string | null;
  initialClients: Client[];
  initialSeats: Seats;
  includedSeats: number;
  extraSeats: number;
  seatPrice: number;
  canBuySeats: boolean;
  /** Owners and admins assign and remove clients; members record and reply. */
  canManage: boolean;
  /** May add new clients (staff can be stopped by the owner or an admin). */
  canAdd: boolean;
  /** Sees every client, not only their own. Staff without it get only their clients from the server. */
  seesAll: boolean;
  /** Only the owner handles billing. */
  isOwner: boolean;
  meId: string;
  /** Everyone on the team. The assignment controls only show with two or more. */
  staff: Staff[];
  /** Solo plans: suggest Studio once extra seats would cost about as much. */
  studioHint?: { soloBase: number; studioPrice: number; studioClients: number };
};

export default function ClientsManager({ workspaceId, fingerprint, ...rest }: Props) {
  return (
    <TeamKeyGate workspaceId={workspaceId} fingerprint={fingerprint}>
      {(teamKey) => <Manager {...rest} teamKey={teamKey} />}
    </TeamKeyGate>
  );
}

function Manager({
  teamKey,
  initialClients,
  initialSeats,
  includedSeats,
  extraSeats,
  seatPrice,
  canBuySeats,
  canManage,
  canAdd,
  seesAll,
  isOwner,
  meId,
  staff,
  studioHint,
}: Omit<Props, "workspaceId" | "fingerprint"> & { teamKey: CryptoKey }) {
  const [clients, setClients] = useState(initialClients);
  const [seats, setSeats] = useState(initialSeats);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string>();
  const [buyQty, setBuyQty] = useState(5);
  // Staff start on their own clients; owners and admins on everyone.
  const [show, setShow] = useState<"all" | "mine">(canManage ? "all" : "mine");
  const full = seats.used >= seats.limit;
  // Tabs only make sense when there are other people's clients to see.
  const team = staff.length > 1 && seesAll;
  const shown = show === "mine" ? clients.filter((c) => c.assignedToId === meId) : clients;
  const staffName = (id: string | null) => staff.find((p) => p.id === id)?.name;
  // What Solo would cost after this purchase, against Studio's flat price.
  const soloAfter = studioHint ? studioHint.soloBase + (extraSeats + buyQty) * seatPrice : 0;
  const suggestStudio = studioHint && soloAfter >= studioHint.studioPrice - 5;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Each client gets their own key, created here and stored only wrapped with the team key.
      body: JSON.stringify({ name, email, teamKeyWrap: await wrapKey(await generateKey(), teamKey), keyFingerprint: await fingerprint(teamKey) }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "Could not add client");
    setClients((c) => [...c, data.client].sort((a, b) => a.name.localeCompare(b.name)));
    setSeats((s) => ({ ...s, used: s.used + 1 }));
    setName("");
    setEmail("");
  }

  async function remove(c: Client) {
    if (!confirm(`Remove ${c.name}? Their link will stop working and the seat becomes free.`)) return;
    const res = await fetch(`/api/clients/${c.id}`, { method: "DELETE" });
    if (!res.ok) return;
    setClients((list) => list.filter((x) => x.id !== c.id));
    setSeats((s) => ({ ...s, used: s.used - 1 }));
  }

  async function assign(c: Client, assignedToId: string | null) {
    setError(undefined);
    const res = await fetch(`/api/clients/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignedToId }),
    });
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error ?? "Could not assign client");
    setClients((list) => list.map((x) => (x.id === c.id ? { ...x, assignedToId } : x)));
  }

  async function copy(c: Client) {
    await navigator.clipboard.writeText(await personalLink(c.link, c.teamKeyWrap, teamKey));
    void markLinkSent(c.id);
    setCopied(c.id);
    setTimeout(() => setCopied(undefined), 2000);
  }

  async function buySeats() {
    setError(undefined);
    const res = await fetch("/api/billing/seats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ extraSeats: extraSeats + buyQty }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(data.error ?? "Could not add seats");
    window.location.reload();
  }

  return (
    <div className="mt-8 grid gap-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-500">Client seats</p>
            <p className="mt-1 text-3xl font-semibold text-slate-900">
              {seats.used} <span className="text-lg font-normal text-slate-500">of {seats.limit} used</span>
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {includedSeats} included with your plan{extraSeats > 0 && ` + ${extraSeats} extra`}
            </p>
          </div>
          <div
            role="progressbar"
            aria-label="Client seats used"
            aria-valuemin={0}
            aria-valuenow={seats.used}
            aria-valuemax={seats.limit}
            className="h-2 w-full overflow-hidden rounded-full bg-slate-100 sm:w-64"
          >
            <div className={`h-full ${full ? "bg-amber-500" : "bg-brand-600"}`} style={{ width: `${Math.min(100, (seats.used / Math.max(1, seats.limit)) * 100)}%` }} />
          </div>
        </div>
        {!isOwner ? null : canBuySeats ? (
          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-5 text-sm">
            <span className="text-slate-700">Need more?</span>
            <select value={buyQty} onChange={(e) => setBuyQty(Number(e.target.value))} aria-label="Extra clients" className="rounded-lg border border-slate-300 bg-white px-2 py-1.5">
              {[1, 5, 10, 25, 50].map((n) => <option key={n} value={n}>{n} {n === 1 ? "client" : "clients"}</option>)}
            </select>
            <button onClick={buySeats} className="rounded-lg bg-slate-900 px-3 py-1.5 font-medium text-white hover:bg-slate-800">
              Add for {money(buyQty * seatPrice)}/month
            </button>
            {suggestStudio && (
              <p data-testid="studio-hint" className="mt-3 w-full rounded-lg bg-brand-50 px-3 py-2 text-brand-900">
                That would bring Solo to {money(soloAfter)}/month. Studio is {money(studioHint.studioPrice)}/month with {studioHint.studioClients} clients and 3 staff logins included.{" "}
                <Link href="/pricing" className="font-medium underline">Compare plans</Link>
              </p>
            )}
          </div>
        ) : (
          <p className="mt-5 border-t border-slate-100 pt-5 text-sm text-slate-600">
            <Link href="/pricing" className="font-medium text-brand-700 hover:underline">Upgrade</Link> for 10 or more clients, with extra clients at {money(seatPrice)} each per month.
          </p>
        )}
      </section>

      {canAdd && (
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="font-semibold text-slate-900">Add a client</h2>
        <form onSubmit={add} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Name" aria-label="Client name" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email (optional)" aria-label="Client email" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <button disabled={busy || full} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            Add client
          </button>
        </form>
        {full && <p className="mt-2 text-sm text-amber-700">All seats are in use. Add seats or remove a client to add someone new.</p>}
        {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
      </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white">
        {team && (
          <div role="tablist" aria-label="Which clients" className="flex gap-1 border-b border-slate-100 px-4 pt-3 text-sm">
            {(["all", "mine"] as const).map((k) => (
              <button key={k} role="tab" aria-selected={show === k} onClick={() => setShow(k)}
                className={`rounded-t-lg px-3 py-2 ${show === k ? "border-b-2 border-brand-600 font-medium text-slate-900" : "text-slate-500 hover:text-slate-900"}`}>
                {k === "all" ? `All clients (${clients.length})` : `My clients (${clients.filter((c) => c.assignedToId === meId).length})`}
              </button>
            ))}
          </div>
        )}
        {shown.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">{clients.length === 0 && seesAll ? "No clients yet." : "No clients are assigned to you yet."}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {shown.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
                <div>
                  <Link href={`/clients/${c.id}`} className="font-medium text-slate-900 hover:text-brand-700 hover:underline">{c.name}</Link>
                  <p className="text-xs text-slate-500">
                    {c.email ? `${c.email} · ` : ""}{c.videoCount} {c.videoCount === 1 ? "video" : "videos"}
                    {staff.length > 1 && seesAll && !canManage && ` · ${staffName(c.assignedToId) ?? "Shared"}`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-sm">
                  {staff.length > 1 && canManage && (
                    <select aria-label={`Who looks after ${c.name}`} value={c.assignedToId ?? ""} onChange={(e) => assign(c, e.target.value || null)}
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1.5">
                      <option value="">Shared</option>
                      {staff.map((p) => <option key={p.id} value={p.id}>{p.id === meId ? `${p.name} (you)` : p.name}</option>)}
                    </select>
                  )}
                  <button onClick={() => copy(c)} className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-50">
                    {copied === c.id ? "Copied" : "Copy personal link"}
                  </button>
                  {canManage && <button onClick={() => remove(c)} className="rounded-lg px-3 py-1.5 text-slate-500 hover:bg-slate-50 hover:text-red-700">Remove</button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
