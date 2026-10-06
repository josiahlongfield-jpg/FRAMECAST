"use client";

import { useState } from "react";

type Client = { id: string; name: string; email: string | null; link: string; videoCount: number };
type Seats = { used: number; limit: number };

export default function ClientsManager({
  initialClients,
  initialSeats,
  includedSeats,
  extraSeats,
  seatPrice,
  canBuySeats,
}: {
  initialClients: Client[];
  initialSeats: Seats;
  includedSeats: number;
  extraSeats: number;
  seatPrice: number;
  canBuySeats: boolean;
}) {
  const [clients, setClients] = useState(initialClients);
  const [seats, setSeats] = useState(initialSeats);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string>();
  const [buyQty, setBuyQty] = useState(5);
  const full = seats.used >= seats.limit;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email }),
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

  async function copy(c: Client) {
    await navigator.clipboard.writeText(c.link);
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
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 sm:w-64">
            <div className={`h-full ${full ? "bg-amber-500" : "bg-brand-600"}`} style={{ width: `${Math.min(100, (seats.used / Math.max(1, seats.limit)) * 100)}%` }} />
          </div>
        </div>
        {canBuySeats ? (
          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-5 text-sm">
            <span className="text-slate-700">Need more?</span>
            <select value={buyQty} onChange={(e) => setBuyQty(Number(e.target.value))} className="rounded-lg border border-slate-300 bg-white px-2 py-1.5">
              {[1, 5, 10, 25, 50].map((n) => <option key={n} value={n}>{n} seats</option>)}
            </select>
            <button onClick={buySeats} className="rounded-lg bg-slate-900 px-3 py-1.5 font-medium text-white hover:bg-slate-800">
              Add for ${buyQty * seatPrice}/month
            </button>
          </div>
        ) : (
          <p className="mt-5 border-t border-slate-100 pt-5 text-sm text-slate-600">
            <a href="/pricing" className="font-medium text-brand-700 hover:underline">Upgrade</a> for 10 or more client seats, with extra seats at ${seatPrice} each per month.
          </p>
        )}
      </section>

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

      <section className="rounded-2xl border border-slate-200 bg-white">
        {clients.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">No clients yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {clients.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
                <div>
                  <p className="font-medium text-slate-900">{c.name}</p>
                  <p className="text-xs text-slate-500">
                    {c.email ? `${c.email} · ` : ""}{c.videoCount} {c.videoCount === 1 ? "video" : "videos"}
                  </p>
                </div>
                <div className="flex gap-2 text-sm">
                  <button onClick={() => copy(c)} className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-50">
                    {copied === c.id ? "Copied" : "Copy personal link"}
                  </button>
                  <button onClick={() => remove(c)} className="rounded-lg px-3 py-1.5 text-slate-500 hover:bg-slate-50 hover:text-red-700">Remove</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
