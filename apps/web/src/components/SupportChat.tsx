"use client";

import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from "react";

type Message = { id: string; author: "CUSTOMER" | "ASSISTANT" | "STAFF"; body: string; at: string };
type Ticket = { status: "OPEN" | "NEEDS_HUMAN" | "ANSWERED" | "CLOSED"; messages: Message[] };

const KEY = "sureframe.support";
const read = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};
const save = (t: string | null) => {
  try {
    if (t) localStorage.setItem(KEY, t);
    else localStorage.removeItem(KEY);
  } catch {}
};

const WELCOME = "Hi! I'm SureFrame's assistant. Ask me anything about recording, clients, billing or your account. I can pass you to a person whenever you'd like.";

/** The support conversation: the AI assistant first, a person when needed. */
export function SupportChat({ signedIn, className = "" }: { signedIn: boolean; className?: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [text, setText] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const end = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async (t: string) => {
    const res = await fetch("/api/support", { headers: { "x-support-token": t } });
    if (res.status === 404) {
      save(null);
      setToken(null);
      setTicket(null);
      return;
    }
    if (res.ok) setTicket(await res.json());
  }, []);

  useEffect(() => {
    // A link from a support email carries the conversation in the #fragment.
    const fromLink = new URLSearchParams(location.hash.slice(1)).get("t");
    if (fromLink) {
      save(fromLink);
      history.replaceState(null, "", location.pathname + location.search);
    }
    const t = fromLink ?? read();
    if (t) {
      setToken(t);
      refresh(t);
    }
  }, [refresh]);

  // While a person is involved, check for their reply now and then.
  useEffect(() => {
    if (!token || !ticket || ticket.status === "OPEN") return;
    const id = setInterval(() => refresh(token), 20000);
    return () => clearInterval(id);
  }, [token, ticket, refresh]);

  // Braces matter: newer Chrome returns a Promise from scrollIntoView, which
  // React would otherwise try to call as the effect's cleanup.
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [ticket?.messages.length, busy]);

  async function send(body: string) {
    if (!body.trim() || busy) return;
    setBusy(true);
    setError(undefined);
    const optimistic: Message = { id: "pending", author: "CUSTOMER", body, at: new Date().toISOString() };
    setTicket((t) => ({ status: t?.status ?? "OPEN", messages: [...(t?.messages ?? []), optimistic] }));
    setText("");
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token ?? undefined, body, email: !signedIn && email ? email : undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't send that. Please try again.");
      save(data.token);
      setToken(data.token);
      setTicket({ status: data.status, messages: data.messages });
    } catch (e) {
      setError((e as Error).message);
      setText(body);
      setTicket((t) => (t ? { ...t, messages: t.messages.filter((m) => m.id !== "pending") } : t));
    } finally {
      setBusy(false);
    }
  }

  function startOver() {
    save(null);
    setToken(null);
    setTicket(null);
    setError(undefined);
  }

  const withPerson = ticket && ticket.status !== "OPEN";
  const needsEmail = !signedIn && !token;

  return (
    <div className={`flex min-h-0 flex-col ${className}`} translate="no">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
        <Bubble author="ASSISTANT" body={WELCOME} />
        {ticket?.messages.map((m) => <Bubble key={m.id} author={m.author} body={m.body} />)}
        {busy && <p className="text-sm text-slate-500">Thinking…</p>}
        {withPerson && (
          <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900" data-testid="with-person">
            {ticket.status === "ANSWERED" ? "The SureFrame team has replied." : "A person from the SureFrame team will reply"}
            {signedIn ? " here and by email." : email || !needsEmail ? " here and by email if you gave your address." : " here."}
          </p>
        )}
        <div ref={end} />
      </div>
      <form
        className="border-t border-slate-200 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        {needsEmail && (
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Your email (so we can reply)"
            aria-label="Your email"
            data-gramm="false"
            className="mb-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(text);
              }
            }}
            rows={2}
            maxLength={4000}
            data-gramm="false"
            data-gramm_editor="false"
            data-enable-grammarly="false"
            placeholder="Type your question…"
            aria-label="Your message"
            className="min-h-[44px] flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button disabled={busy || !text.trim()} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            Send
          </button>
        </div>
        {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
        <div className="mt-2 flex justify-between text-xs text-slate-500">
          {!withPerson ? (
            <button type="button" onClick={() => send("I'd like to talk to a person, please.")} disabled={busy} className="hover:text-slate-900">
              Talk to a person
            </button>
          ) : (
            <span />
          )}
          {ticket && (
            <button type="button" onClick={startOver} className="hover:text-slate-900">
              New conversation
            </button>
          )}
        </div>
        <p className="mt-2 text-[11px] text-slate-400">Answers come from an AI assistant and can be wrong. Never share your recovery key, password or card details.</p>
      </form>
    </div>
  );
}

function Bubble({ author, body }: { author: Message["author"]; body: string }) {
  const mine = author === "CUSTOMER";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${mine ? "bg-brand-600 text-white" : author === "STAFF" ? "border border-emerald-200 bg-emerald-50 text-slate-900" : "bg-slate-100 text-slate-900"}`}>
        {author === "STAFF" && <p className="mb-1 text-xs font-semibold text-emerald-800">SureFrame team</p>}
        {body}
      </div>
    </div>
  );
}

/** Tells the server what broke in a visitor's browser, so it shows up in the logs. */
export function reportClientError(where: string, error: unknown) {
  try {
    const e = error as { name?: string; message?: string; stack?: string };
    const body = JSON.stringify({ where, name: e?.name, message: String(e?.message ?? error).slice(0, 500), stack: e?.stack?.slice(0, 1500), url: location.pathname, ua: navigator.userAgent });
    navigator.sendBeacon?.("/api/support/client-error", new Blob([body], { type: "application/json" }));
  } catch {}
}

/**
 * Keeps a problem inside the chat (a browser extension rewriting the text box,
 * say) from taking the whole page down with it.
 */
export class ChatBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    reportClientError("support-chat", error);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex flex-1 flex-col items-start gap-3 p-4 text-sm text-slate-700" role="alert">
        <p>The chat hit a problem in this browser. A browser extension that edits text boxes can cause this.</p>
        <button onClick={() => this.setState({ failed: false })} className="rounded-lg bg-brand-600 px-3 py-2 font-semibold text-white hover:bg-brand-700">
          Try again
        </button>
        <a href="/help" className="text-brand-700 hover:underline">Open the help page instead</a>
      </div>
    );
  }
}

/** A Help button fixed to the corner that opens the chat in a panel. */
export default function SupportWidget({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {open && (
        <div role="dialog" aria-label="SureFrame help" className="fixed inset-x-3 bottom-20 z-50 flex h-[70vh] max-h-[600px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:inset-x-auto sm:right-6 sm:w-[380px]">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <p className="font-semibold text-slate-900">SureFrame help</p>
            <button onClick={() => setOpen(false)} aria-label="Close help" className="rounded-lg px-2 text-slate-500 hover:text-slate-900">
              ✕
            </button>
          </div>
          <ChatBoundary>
            <SupportChat signedIn={signedIn} className="flex-1" />
          </ChatBoundary>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-lg hover:bg-slate-800 sm:right-6"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></svg>
        Help
      </button>
    </>
  );
}
