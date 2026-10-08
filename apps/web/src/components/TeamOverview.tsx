"use client";

import Link from "next/link";
import { useState } from "react";
import { PermChecks, savePerm, type Perms } from "./StaffPerms";

type Role = "OWNER" | "ADMIN" | "MEMBER";
export type OverviewStaff = { userId: string; name: string; email: string; role: Role; perms: Perms };
export type OverviewClient = { id: string; name: string; assignedToId: string | null };
type Scope = "ALL" | "SELECTED" | "MINE" | "OFF";
export type Prefs = { replyNotify: Scope; replyNotifyStaff: string[]; sentNotify: Scope; sentNotifyStaff: string[] };

const ROLE_LABEL: Record<Role, string> = { OWNER: "Owner", ADMIN: "Admin", MEMBER: "Member" };

/** Staff, what they can do, and who looks after which clients (with bulk reassign). */
export function Delegations({ meId, initialStaff, initialClients }: { meId: string; initialStaff: OverviewStaff[]; initialClients: OverviewClient[] }) {
  const [staff, setStaff] = useState(initialStaff);
  const [clients, setClients] = useState(initialClients);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState<string>("");
  const [note, setNote] = useState<string>();
  const [busy, setBusy] = useState(false);
  const nameOf = (id: string | null) => staff.find((s) => s.userId === id)?.name ?? "Shared";

  async function setPerm(s: OverviewStaff, key: keyof Perms, value: boolean) {
    setNote(undefined);
    const flip = (v: boolean) => setStaff((list) => list.map((x) => (x.userId === s.userId ? { ...x, perms: { ...x.perms, [key]: v } } : x)));
    flip(value);
    const error = await savePerm(s.userId, key, value);
    if (error) {
      flip(!value);
      setNote(error);
    }
  }

  async function assign() {
    setBusy(true);
    setNote(undefined);
    const assignedToId = target || null;
    const res = await fetch("/api/clients/assign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientIds: [...picked], assignedToId }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setNote(data.error ?? "Could not assign those clients");
    setClients((list) => list.map((c) => (picked.has(c.id) ? { ...c, assignedToId } : c)));
    setNote(`${data.updated} ${data.updated === 1 ? "client" : "clients"} now with ${nameOf(assignedToId)}.`);
    setPicked(new Set());
  }

  const toggle = (id: string) => setPicked((cur) => { const next = new Set(cur); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  return (
    <div className="grid gap-6">
      <ul className="grid gap-4">
        {staff.map((s) => {
          const theirs = clients.filter((c) => c.assignedToId === s.userId);
          return (
            <li key={s.userId} className="rounded-2xl border border-slate-200 bg-white p-5" data-testid={`staff-${s.email}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-slate-900">{s.name}{s.userId === meId && " (you)"}</p>
                  <p className="text-xs text-slate-500">{s.email}</p>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{ROLE_LABEL[s.role]}</span>
              </div>
              {s.role === "MEMBER" ? (
                <div className="mt-3">
                  <PermChecks name={s.name} email={s.email} perms={s.perms} self={false} editable onChange={(k, v) => setPerm(s, k, v)} />
                </div>
              ) : (
                <p className="mt-2 text-xs text-slate-500">Full access to every client and video.</p>
              )}
              <p className="mt-3 text-sm text-slate-700">
                <span className="font-medium">Looks after:</span>{" "}
                {theirs.length ? theirs.map((c, i) => (
                  <span key={c.id}>{i > 0 && ", "}<Link href={`/clients/${c.id}`} className="hover:underline">{c.name}</Link></span>
                )) : <span className="text-slate-500">no clients yet</span>}
              </p>
            </li>
          );
        })}
      </ul>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="font-semibold text-slate-900">Reassign clients</h3>
        <p className="mt-1 text-xs text-slate-500">Tick clients, then choose who looks after them. Members only see the clients assigned to them, unless they can see all clients.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <button type="button" onClick={() => setPicked(new Set(clients.filter((c) => !c.assignedToId).map((c) => c.id)))} className="rounded-full border border-slate-300 px-3 py-1 hover:bg-slate-50">Pick unassigned</button>
          <button type="button" onClick={() => setPicked(new Set(clients.map((c) => c.id)))} className="rounded-full border border-slate-300 px-3 py-1 hover:bg-slate-50">Pick all</button>
          {picked.size > 0 && <button type="button" onClick={() => setPicked(new Set())} className="rounded-full px-3 py-1 text-slate-500 hover:text-slate-900">Clear</button>}
        </div>
        <ul className="mt-3 grid max-h-72 gap-1 overflow-y-auto rounded-lg border border-slate-200 p-2 sm:grid-cols-2">
          {clients.map((c) => (
            <li key={c.id}>
              <label className="flex items-center justify-between gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50">
                <span className="flex items-center gap-2">
                  <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} aria-label={`Pick ${c.name}`} />
                  {c.name}
                </span>
                <span className="text-xs text-slate-500">{nameOf(c.assignedToId)}</span>
              </label>
            </li>
          ))}
          {clients.length === 0 && <li className="px-2 py-1 text-sm text-slate-500">No clients yet.</li>}
        </ul>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Assign picked clients to" className="rounded-lg border border-slate-300 bg-white px-2 py-1.5">
            <option value="">Shared (nobody)</option>
            {staff.map((s) => <option key={s.userId} value={s.userId}>{s.name}</option>)}
          </select>
          <button type="button" onClick={assign} disabled={busy || picked.size === 0} className="rounded-lg bg-brand-600 px-4 py-1.5 font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            Assign {picked.size || ""} {picked.size === 1 ? "client" : "clients"}
          </button>
        </div>
      </section>
      {note && <p role="status" className="text-sm text-slate-700">{note}</p>}
    </div>
  );
}

const SCOPES: { value: Scope; label: string }[] = [
  { value: "ALL", label: "All staff" },
  { value: "SELECTED", label: "Only selected staff" },
  { value: "MINE", label: "Only my own clients" },
  { value: "OFF", label: "Off" },
];

/** The owner's or admin's own email preferences. */
export function NotifyPrefs({ meId, staff, initial }: { meId: string; staff: OverviewStaff[]; initial: Prefs }) {
  const [prefs, setPrefs] = useState(initial);
  const [saved, setSaved] = useState<string>();
  const others = staff.filter((s) => s.userId !== meId);

  async function save(next: Prefs) {
    setPrefs(next);
    setSaved(undefined);
    const res = await fetch("/api/team/prefs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
    setSaved(res.ok ? "Saved." : "Couldn't save. Try again.");
  }
  const toggleIn = (list: string[], id: string, on: boolean) => (on ? [...new Set([...list, id])] : list.filter((x) => x !== id));

  return (
    <div className="grid gap-5 rounded-2xl border border-slate-200 bg-white p-5 text-sm">
      <fieldset>
        <legend className="font-medium text-slate-900">Client replies</legend>
        <p className="text-xs text-slate-500">You always hear about your own clients unless this is off. Staff hear about replies from their clients.</p>
        <div className="mt-2 flex flex-wrap gap-3">
          {SCOPES.map((s) => (
            <label key={s.value} className="flex items-center gap-1.5">
              <input type="radio" name="replyNotify" checked={prefs.replyNotify === s.value} onChange={() => save({ ...prefs, replyNotify: s.value })} />
              {s.label}
            </label>
          ))}
        </div>
        {prefs.replyNotify === "SELECTED" && (
          <div className="mt-2 flex flex-wrap gap-3 rounded-lg bg-slate-50 px-3 py-2">
            {others.map((s) => (
              <label key={s.userId} className="flex items-center gap-1.5">
                <input type="checkbox" checked={prefs.replyNotifyStaff.includes(s.userId)} onChange={(e) => save({ ...prefs, replyNotifyStaff: toggleIn(prefs.replyNotifyStaff, s.userId, e.target.checked) })} aria-label={`Replies to ${s.name}'s clients`} />
                {s.name}&apos;s clients
              </label>
            ))}
          </div>
        )}
      </fieldset>
      <fieldset>
        <legend className="font-medium text-slate-900">Videos sent by staff</legend>
        <div className="mt-2 flex flex-wrap gap-3">
          {SCOPES.map((s) => (
            <label key={s.value} className="flex items-center gap-1.5">
              <input type="radio" name="sentNotify" checked={prefs.sentNotify === s.value} onChange={() => save({ ...prefs, sentNotify: s.value })} />
              {s.value === "MINE" ? "Only to my own clients" : s.label}
            </label>
          ))}
        </div>
        {prefs.sentNotify === "SELECTED" && (
          <div className="mt-2 grid gap-1.5 rounded-lg bg-slate-50 px-3 py-2">
            {others.map((s) => (
              <label key={s.userId} className="flex items-center gap-1.5">
                <input type="checkbox" checked={prefs.sentNotifyStaff.includes(s.userId)} onChange={(e) => save({ ...prefs, sentNotifyStaff: toggleIn(prefs.sentNotifyStaff, s.userId, e.target.checked) })} aria-label={`Tell me when ${s.name} sends a video`} />
                Tell me when {s.name} sends a video
              </label>
            ))}
          </div>
        )}
      </fieldset>
      <p className="text-xs text-slate-500">Emails are combined: at most one every 15 minutes per conversation or staff member. They never include replies or video titles.</p>
      {saved && <p role="status" className="text-xs text-slate-600">{saved}</p>}
    </div>
  );
}

/** Send a short reminder to one, several or all staff. */
export function StaffReminderForm({ meId, staff, clients, videos }: { meId: string; staff: OverviewStaff[]; clients: OverviewClient[]; videos: { id: string; title: string }[] }) {
  const others = staff.filter((s) => s.userId !== meId);
  const [to, setTo] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [note, setNote] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNote(undefined);
    const [kind, id] = link.split(":");
    const res = await fetch("/api/team/notices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: to.size === others.length ? "all" : [...to], message, link: link ? { kind, id } : undefined }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setNote(data.error ?? "Could not send the reminder");
    setNote(`Sent to ${data.sent} ${data.sent === 1 ? "person" : "people"}.`);
    setMessage("");
    setLink("");
    setTo(new Set());
  }

  if (!others.length) return <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">Invite staff on the Team page to send them reminders.</p>;
  return (
    <form onSubmit={send} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-medium text-slate-900">To</span>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={to.size === others.length} onChange={(e) => setTo(e.target.checked ? new Set(others.map((s) => s.userId)) : new Set())} />
          Everyone
        </label>
        {others.map((s) => (
          <label key={s.userId} className="flex items-center gap-1.5">
            <input type="checkbox" checked={to.has(s.userId)} onChange={(e) => setTo((cur) => { const next = new Set(cur); if (e.target.checked) next.add(s.userId); else next.delete(s.userId); return next; })} aria-label={`Remind ${s.name}`} />
            {s.name}
          </label>
        ))}
      </div>
      <textarea value={message} onChange={(e) => setMessage(e.target.value)} required maxLength={500} rows={2} placeholder="e.g. Please check in with your clients before Friday." aria-label="Reminder message" className="rounded-lg border border-slate-300 px-3 py-2" />
      <div className="flex flex-wrap items-center gap-2">
        <select value={link} onChange={(e) => setLink(e.target.value)} aria-label="Link to" className="max-w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5">
          <option value="">No link</option>
          <optgroup label="Clients">
            {clients.map((c) => <option key={c.id} value={`client:${c.id}`}>{c.name}</option>)}
          </optgroup>
          <optgroup label="Recent videos">
            {videos.map((v) => <option key={v.id} value={`video:${v.id}`}>{v.title}</option>)}
          </optgroup>
        </select>
        <button disabled={busy || !to.size || !message.trim()} className="rounded-lg bg-brand-600 px-4 py-1.5 font-semibold text-white hover:bg-brand-700 disabled:opacity-50">Send reminder</button>
      </div>
      <p className="text-xs text-slate-500">They get an email and see it in the app until they dismiss it.</p>
      {note && <p role="status" className="text-slate-700">{note}</p>}
    </form>
  );
}
