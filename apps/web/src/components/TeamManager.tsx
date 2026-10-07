"use client";

import { useState } from "react";
import { exportKey, generateKey, wrapKey } from "@/lib/e2e/crypto";
import { saveKey, teamKeyName } from "@/lib/e2e/keystore";
import { rekey, type Bundle } from "@/lib/e2e/rekey";
import TeamKeyGate from "./TeamKeyGate";

type Role = "OWNER" | "ADMIN" | "MEMBER";
type Member = { userId: string; name: string; email: string; role: Role };
type Invite = { id: string; email: string | null; role: Role; expiresAt: string };
type Seats = { members: number; pending: number; used: number; limit: number };

type Props = {
  workspaceId: string;
  fingerprint: string | null;
  role: Role;
  meId: string;
  initialSeats: Seats;
  includedStaff: number;
  extraStaff: number;
  canBuyStaff: boolean;
  staffPrice: number;
  initialMembers: Member[];
  initialInvites: Invite[];
  workspaces: { id: string; name: string; active: boolean }[];
  /** Someone left on their own and still holds the old keys. */
  keyResetNeeded: string | null;
};

const ROLE_LABEL: Record<Role, string> = { OWNER: "Owner", ADMIN: "Admin", MEMBER: "Member" };

export default function TeamManager(props: Props) {
  return (
    <div className="mt-8 grid gap-6">
      {props.role !== "MEMBER" ? (
        // Inviting needs the team key on this device: the invite link carries it, wrapped.
        <TeamKeyGate workspaceId={props.workspaceId} fingerprint={props.fingerprint}>
          {(teamKey) => <Manager {...props} teamKey={teamKey} />}
        </TeamKeyGate>
      ) : (
        <Manager {...props} />
      )}
      {props.workspaces.length > 1 && <Switcher workspaces={props.workspaces} />}
    </div>
  );
}

function Manager({ teamKey, workspaceId, keyResetNeeded, role, meId, initialSeats, includedStaff, extraStaff, canBuyStaff, staffPrice, initialMembers, initialInvites }: Props & { teamKey?: CryptoKey }) {
  const [members, setMembers] = useState(initialMembers);
  const [invites, setInvites] = useState(initialInvites);
  const [seats, setSeats] = useState(initialSeats);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("MEMBER");
  const [link, setLink] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [buyQty, setBuyQty] = useState(1);
  const [removing, setRemoving] = useState<string>();
  const [reset, setReset] = useState<{ name: string | null; removed: boolean; emailed: number; toSend: { id: string; name: string; link: string }[]; recoveryKey: string }>();
  const [resetDue, setResetDue] = useState(!!keyResetNeeded);
  const canManage = role !== "MEMBER";
  const full = seats.used >= seats.limit;

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!teamKey) return;
    setBusy(true);
    setError(undefined);
    setLink(undefined);
    // A one-off key wraps the team key. It goes only in the link's #fragment, which never reaches our servers.
    const oneOff = await generateKey();
    const res = await fetch("/api/team/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role: inviteRole, teamKeyWrap: await wrapKey(teamKey, oneOff) }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "Could not create the invite");
    setLink(`${data.link}#k=${await exportKey(oneOff)}`);
    setInvites((list) => [...list, { ...data.invite, expiresAt: String(data.invite.expiresAt) }]);
    setSeats((s) => ({ ...s, pending: s.pending + 1, used: s.used + 1 }));
    setEmail("");
  }

  async function cancel(i: Invite) {
    const res = await fetch(`/api/team/invites/${i.id}`, { method: "DELETE" });
    if (!res.ok) return;
    setInvites((list) => list.filter((x) => x.id !== i.id));
    setSeats((s) => ({ ...s, pending: s.pending - 1, used: s.used - 1 }));
  }

  async function changeRole(m: Member, next: Role) {
    setError(undefined);
    const res = await fetch(`/api/team/members/${m.userId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: next }) });
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error ?? "Could not change the role");
    setMembers((list) => list.map((x) => (x.userId === m.userId ? { ...x, role: next } : x)));
  }

  async function remove(m: Member) {
    if (!confirm(`Remove ${m.name}? Your team's encryption keys and every client's personal link will be reset, so they can't open anything again. Clients with an email get their new link automatically.`)) return;
    await resetKeys(m);
  }

  /** Reset every key on this device, then swap them in on the server (removing `m` if given). */
  async function resetKeys(m?: Member) {
    if (!teamKey) return;
    setError(undefined);
    setRemoving(m?.userId ?? "reset");
    try {
      // The key reset happens here, on this device: new team key, new client keys, everything re-sealed.
      let res = await fetch("/api/team/rekey");
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Could not start the key reset");
      const bundle = (await res.json()) as Bundle;
      const { team, newClientKeys, payload } = await rekey(teamKey, bundle);
      res = await fetch(m ? `/api/team/members/${m.userId}/remove` : "/api/team/rekey", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not remove");
      await saveKey(teamKeyName(workspaceId), team);
      const names = new Map(bundle.clients.map((c) => [c.id, c]));
      const toSend = await Promise.all(
        (data.links as { id: string; link: string }[])
          .filter((l) => !names.get(l.id)?.hasEmail)
          .map(async (l) => {
            const key = newClientKeys.get(l.id);
            return { id: l.id, name: names.get(l.id)?.name ?? "Client", link: key ? `${l.link}#k=${await exportKey(key)}` : l.link };
          }),
      );
      setReset({ name: m?.name ?? keyResetNeeded ?? null, removed: !!m, emailed: data.emailed, toSend, recoveryKey: await exportKey(team) });
      setResetDue(false);
      setInvites([]);
      if (m) {
        setMembers((list) => list.filter((x) => x.userId !== m.userId));
        setSeats((s) => ({ ...s, members: s.members - 1, pending: 0, used: s.members - 1 }));
      } else {
        setSeats((s) => ({ ...s, pending: 0, used: s.members }));
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRemoving(undefined);
    }
  }

  async function buyStaff() {
    setError(undefined);
    const res = await fetch("/api/billing/staff", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ extraStaff: extraStaff + buyQty }) });
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error ?? "Could not add staff logins");
    window.location.reload();
  }

  return (
    <>
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <p className="text-sm font-medium text-slate-500">Staff logins</p>
        <p className="mt-1 text-3xl font-semibold text-slate-900">
          {seats.used} <span className="text-lg font-normal text-slate-500">of {seats.limit} used</span>
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {includedStaff} included with your plan{extraStaff > 0 && ` + ${extraStaff} extra`}
          {seats.pending > 0 && ` · ${seats.pending} waiting to join`}
        </p>
        {canBuyStaff && (
          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-5 text-sm">
            <span className="text-slate-700">Need more?</span>
            <select value={buyQty} onChange={(e) => setBuyQty(Number(e.target.value))} aria-label="Extra staff logins" className="rounded-lg border border-slate-300 bg-white px-2 py-1.5">
              {[1, 2, 3, 5, 10].map((n) => <option key={n} value={n}>{n} {n === 1 ? "login" : "logins"}</option>)}
            </select>
            <button onClick={buyStaff} className="rounded-lg bg-slate-900 px-3 py-1.5 font-medium text-white hover:bg-slate-800">Add for ${buyQty * staffPrice}/month</button>
          </div>
        )}
      </section>

      {canManage && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="font-semibold text-slate-900">Invite someone</h2>
          <form onSubmit={invite} className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Their email (optional, for your records)" aria-label="Staff email" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Role)} aria-label="Role" className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm">
              <option value="MEMBER">Member</option>
              <option value="ADMIN">Admin</option>
            </select>
            <button disabled={busy || full} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">Create invite link</button>
          </form>
          <p className="mt-2 text-xs text-slate-500">Members record, send and reply to clients. Admins can also invite staff, assign clients and remove them.</p>
          {full && <p className="mt-2 text-sm text-amber-700">{seats.limit === 1 ? "Team logins come with Studio and Agency." : "All staff logins are in use."}</p>}
          {link && (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
              <p className="font-medium text-emerald-900">Send this link to them yourself. It works once and expires in 7 days.</p>
              <p data-testid="invite-link" className="mt-2 break-all rounded-lg bg-white px-3 py-2 font-mono text-xs text-slate-900">{link}</p>
              <button
                onClick={async () => { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                className="mt-2 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 hover:bg-emerald-100">
                {copied ? "Copied" : "Copy link"}
              </button>
              <p className="mt-2 text-xs text-emerald-900">It carries the key that unlocks your team&apos;s encrypted videos, so we can&apos;t email it for you.</p>
            </div>
          )}
          {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
        </section>
      )}

      {resetDue && canManage && (
        <section role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-950">
          <h2 className="font-semibold">{keyResetNeeded} left the team and still holds its keys</h2>
          <p className="mt-1">Reset your team&apos;s keys and every client&apos;s personal link so they can&apos;t open anything again. Clients with an email get their new link automatically.</p>
          <button onClick={() => resetKeys()} disabled={!!removing} className="mt-3 rounded-lg bg-amber-600 px-4 py-2 font-semibold text-white hover:bg-amber-700 disabled:opacity-50">
            {removing === "reset" ? "Resetting keys…" : "Reset keys now"}
          </button>
        </section>
      )}
      {reset && <ResetDone {...reset} />}

      <section className="rounded-2xl border border-slate-200 bg-white">
        <ul className="divide-y divide-slate-100">
          {members.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
              <div>
                <p className="font-medium text-slate-900">{m.name}{m.userId === meId && " (you)"}</p>
                <p className="text-xs text-slate-500">{m.email}</p>
              </div>
              <div className="flex items-center gap-2 text-sm">
                {canManage && m.role !== "OWNER" ? (
                  <select aria-label={`Role for ${m.name}`} value={m.role} onChange={(e) => changeRole(m, e.target.value as Role)} className="rounded-lg border border-slate-300 bg-white px-2 py-1.5">
                    <option value="MEMBER">Member</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                ) : (
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{ROLE_LABEL[m.role]}</span>
                )}
                {m.role !== "OWNER" && canManage && m.userId !== meId && (
                  <button onClick={() => remove(m)} disabled={!!removing} className="rounded-lg px-3 py-1.5 text-slate-500 hover:bg-slate-50 hover:text-red-700 disabled:opacity-50">
                    {removing === m.userId ? "Resetting keys…" : "Remove"}
                  </button>
                )}
              </div>
            </li>
          ))}
          {invites.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
              <div>
                <p className="font-medium text-slate-700">{i.email ?? "Invite link"}</p>
                <p className="text-xs text-slate-500">Waiting to join · {ROLE_LABEL[i.role]} · expires {new Date(i.expiresAt).toLocaleDateString("en-US", { dateStyle: "medium" })}</p>
              </div>
              <button onClick={() => cancel(i)} className="rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-50 hover:text-red-700">Cancel invite</button>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function ResetDone({ name, removed, emailed, toSend, recoveryKey }: { name: string | null; removed: boolean; emailed: number; toSend: { id: string; name: string; link: string }[]; recoveryKey: string }) {
  const [copied, setCopied] = useState<string>();
  const copy = async (id: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(undefined), 2000);
  };
  return (
    <section role="status" data-testid="key-reset" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-950">
      <h2 className="font-semibold">{removed ? `${name} was removed and your keys were reset` : "Your keys were reset"}</h2>
      <p className="mt-1">
        Every client has a new personal link and their old links no longer work.
        {emailed > 0 && ` ${emailed} ${emailed === 1 ? "client was" : "clients were"} emailed their new link.`}
        {" "}Pending invites were cancelled. Your team&apos;s other devices update on their own.
      </p>
      {toSend.length > 0 && (
        <>
          <p className="mt-4 font-medium">These clients have no email on file. Send them their new link:</p>
          <ul className="mt-2 grid gap-2">
            {toSend.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-slate-800">
                <span>{c.name}</span>
                <button onClick={() => copy(c.id, c.link)} className="rounded-lg border border-slate-300 px-3 py-1 hover:bg-slate-50">{copied === c.id ? "Copied" : "Copy new link"}</button>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="mt-4 font-medium">Your new recovery key</p>
      <p className="mt-1">Save it somewhere safe. Your old recovery key only works for people still on the team.</p>
      <p data-testid="new-recovery-key" className="mt-2 break-all rounded-lg bg-white px-3 py-2 font-mono text-xs text-slate-900">{recoveryKey.match(/.{1,4}/g)?.join(" ")}</p>
      <button onClick={() => copy("recovery", recoveryKey)} className="mt-2 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 hover:bg-emerald-100">{copied === "recovery" ? "Copied" : "Copy recovery key"}</button>
    </section>
  );
}

function Switcher({ workspaces }: { workspaces: { id: string; name: string; active: boolean }[] }) {
  async function go(id: string) {
    const res = await fetch("/api/team/switch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId: id }) });
    if (res.ok) window.location.assign("/library");
  }
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="font-semibold text-slate-900">Your workspaces</h2>
      <ul className="mt-3 grid gap-2 text-sm">
        {workspaces.map((w) => (
          <li key={w.id} className="flex items-center justify-between">
            <span className="text-slate-800">{w.name}</span>
            {w.active ? <span className="text-xs text-slate-500">Current</span> : <button onClick={() => go(w.id)} className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-50">Switch</button>}
          </li>
        ))}
      </ul>
    </section>
  );
}
