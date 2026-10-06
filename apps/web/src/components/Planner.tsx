"use client";

import { useCallback, useEffect, useState } from "react";
import { decryptText, encryptText } from "@/lib/e2e/crypto";
import type { ItemDTO } from "@/lib/items";

type Decrypted = ItemDTO & { text: string };

/**
 * To-dos, notes and due dates, end-to-end encrypted. Members see everything;
 * a client sees and can tick off only what is shared with them.
 *
 * privateKey seals items only the team can read (members only).
 * sharedKey seals items shared with the client (the client's key).
 */
export default function Planner({
  role,
  clientId,
  clientName,
  privateKey,
  sharedKey,
  title = "Tasks & notes",
}: {
  role: "member" | "client";
  clientId: string | null;
  clientName?: string;
  privateKey: CryptoKey | null;
  sharedKey: CryptoKey | null;
  title?: string;
}) {
  const [items, setItems] = useState<Decrypted[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [kind, setKind] = useState<"TASK" | "NOTE">("TASK");
  const [text, setText] = useState("");
  const [due, setDue] = useState("");
  const [share, setShare] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [error, setError] = useState<string>();

  const keyFor = useCallback((shared: boolean) => (shared ? sharedKey : privateKey), [sharedKey, privateKey]);

  const decrypt = useCallback(
    async (i: ItemDTO): Promise<Decrypted> => {
      const key = keyFor(i.shared);
      let text = "[Locked]";
      if (key) text = await decryptText(i.body, key).catch(() => "[Couldn't unlock]");
      return { ...i, text };
    },
    [keyFor],
  );

  useEffect(() => {
    const q = clientId ? `?clientId=${clientId}` : "";
    fetch(`/api/items${q}`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then(async ({ items }: { items: ItemDTO[] }) => {
        setItems(await Promise.all(items.map(decrypt)));
        setLoaded(true);
      });
  }, [clientId, decrypt]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const shared = !!clientId && share;
    const key = keyFor(shared);
    if (!text.trim() || !key) return;
    setError(undefined);
    const res = await fetch("/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind,
        body: await encryptText(text.trim(), key),
        clientId,
        shared,
        dueAt: kind === "TASK" && due ? new Date(due).toISOString() : null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(data.error ?? "Could not save");
    setItems((cur) => [{ ...data.item, text: text.trim() }, ...cur]);
    setText("");
    setDue("");
  }

  async function patch(i: Decrypted, change: Partial<{ done: boolean; shared: boolean; body: string }>) {
    const res = await fetch(`/api/items/${i.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(change),
    });
    if (!res.ok) return;
    const { item } = await res.json();
    setItems((cur) => cur.map((x) => (x.id === i.id ? { ...item, text: i.text } : x)));
  }

  async function toggleShare(i: Decrypted) {
    const key = keyFor(!i.shared);
    if (!key) return;
    // Re-seal the text with the other key so the right people can read it.
    await patch(i, { shared: !i.shared, body: await encryptText(i.text, key) });
  }

  async function remove(i: Decrypted) {
    const res = await fetch(`/api/items/${i.id}`, { method: "DELETE" });
    if (res.ok) setItems((cur) => cur.filter((x) => x.id !== i.id));
  }

  const now = Date.now();
  const open = items
    .filter((i) => i.kind === "TASK" && !i.done)
    .sort((a, b) => (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999"));
  const notes = items.filter((i) => i.kind === "NOTE");
  const done = items.filter((i) => i.kind === "TASK" && i.done);

  const row = (i: Decrypted) => (
    <li key={i.id} className="group flex items-start gap-3 py-2.5">
      {i.kind === "TASK" ? (
        <input
          type="checkbox"
          checked={i.done}
          onChange={() => patch(i, { done: !i.done })}
          aria-label={`Mark "${i.text}" ${i.done ? "not done" : "done"}`}
          className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600"
        />
      ) : (
        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-slate-300" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <p className={`whitespace-pre-wrap text-sm ${i.done ? "text-slate-400 line-through" : "text-slate-800"}`}>{i.text}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          {i.dueAt && (
            <span className={!i.done && new Date(i.dueAt).getTime() < now ? "font-medium text-red-600" : ""}>
              Due {new Date(i.dueAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            </span>
          )}
          {role === "member" && clientId && (
            <button onClick={() => toggleShare(i)} className={`rounded px-1.5 ${i.shared ? "bg-brand-50 text-brand-700" : "bg-slate-100 text-slate-600"} hover:underline`}>
              {i.shared ? `Shared with ${clientName?.split(" ")[0] ?? "client"}` : "Private to your team"}
            </button>
          )}
        </div>
      </div>
      {role === "member" && (
        <button onClick={() => remove(i)} aria-label="Delete" className="text-xs text-slate-400 opacity-0 hover:text-red-600 group-hover:opacity-100 focus:opacity-100">
          Delete
        </button>
      )}
    </li>
  );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="font-semibold text-slate-900">{title}</h2>
      {role === "member" && (
        <form onSubmit={add} className="mt-4 grid gap-2">
          <div role="tablist" aria-label="Item type" className="grid w-48 grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 text-xs">
            {(["TASK", "NOTE"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={kind === k}
                onClick={() => setKind(k)}
                className={`rounded-md px-2 py-1 font-medium ${kind === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}
              >
                {k === "TASK" ? "To-do" : "Note"}
              </button>
            ))}
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={kind === "NOTE" ? 3 : 1}
            placeholder={kind === "TASK" ? "Add a to-do…" : "Write a note…"}
            aria-label={kind === "TASK" ? "New to-do" : "New note"}
            className="resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none"
          />
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {kind === "TASK" && (
              <label className="flex items-center gap-2 text-slate-600">
                Due
                <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" className="rounded-lg border border-slate-300 px-2 py-1 text-sm" />
              </label>
            )}
            {clientId && (
              <label className="flex items-center gap-2 text-slate-600">
                <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} className="accent-brand-600" />
                Share with {clientName?.split(" ")[0] ?? "client"}
              </label>
            )}
            <button className="ml-auto rounded-lg bg-slate-900 px-3 py-1.5 font-medium text-white hover:bg-slate-800">Add</button>
          </div>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        </form>
      )}

      {!loaded ? (
        <p className="mt-4 text-sm text-slate-500">Loading…</p>
      ) : items.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">{role === "client" ? "Nothing shared with you yet." : "Nothing here yet."}</p>
      ) : (
        <div className="mt-4 divide-y divide-slate-100">
          {open.length > 0 && (
            <div className="pb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">To do</h3>
              <ul>{open.map(row)}</ul>
            </div>
          )}
          {notes.length > 0 && (
            <div className="py-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Notes</h3>
              <ul>{notes.map(row)}</ul>
            </div>
          )}
          {done.length > 0 && (
            <div className="pt-2">
              <button onClick={() => setShowDone((v) => !v)} className="text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-800">
                Done ({done.length}) {showDone ? "▾" : "▸"}
              </button>
              {showDone && <ul>{done.map(row)}</ul>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
