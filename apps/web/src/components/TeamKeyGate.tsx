"use client";

import { useEffect, useState } from "react";
import { exportKey, fingerprint as keyFingerprint, generateKey, importKey } from "@/lib/e2e/crypto";
import { loadKey, saveKey, teamKeyName } from "@/lib/e2e/keystore";

type State =
  | { kind: "loading" }
  | { kind: "ready"; key: CryptoKey; recoveryKey?: string }
  | { kind: "recover"; error?: string };

/**
 * Makes sure this device holds the team's end-to-end key before rendering
 * children that record, send or play videos. The first device creates the
 * key and shows a recovery key once; other devices enter that recovery key.
 */
export default function TeamKeyGate({
  workspaceId,
  fingerprint,
  children,
}: {
  workspaceId: string;
  fingerprint: string | null;
  children: (key: CryptoKey) => React.ReactNode;
}) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [input, setInput] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const local = await loadKey(teamKeyName(workspaceId));
      if (local && fingerprint && (await keyFingerprint(local)) === fingerprint) {
        if (!cancelled) setState({ kind: "ready", key: local });
        return;
      }
      if (fingerprint) {
        if (!cancelled) setState({ kind: "recover" });
        return;
      }
      // First device for this workspace: create the team key.
      const key = await generateKey();
      const res = await fetch("/api/workspace/key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fingerprint: await keyFingerprint(key) }),
      });
      if (!res.ok) {
        if (!cancelled) setState({ kind: "recover" });
        return;
      }
      await saveKey(teamKeyName(workspaceId), key);
      if (!cancelled) setState({ kind: "ready", key, recoveryKey: await exportKey(key) });
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, fingerprint]);

  async function recover(e: React.FormEvent) {
    e.preventDefault();
    try {
      const key = await importKey(input.replace(/\s+/g, ""));
      if (fingerprint && (await keyFingerprint(key)) !== fingerprint) throw new Error("That isn't this workspace's recovery key.");
      await saveKey(teamKeyName(workspaceId), key);
      setState({ kind: "ready", key });
    } catch (err) {
      setState({ kind: "recover", error: (err as Error).message });
    }
  }

  if (state.kind === "loading") {
    return <div className="grid h-40 place-items-center text-sm text-slate-500">Unlocking…</div>;
  }

  if (state.kind === "recover") {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="font-semibold text-slate-900">Unlock your videos on this device</h2>
        <p className="mt-2 text-sm text-slate-600">
          Your videos are end-to-end encrypted, so not even we can open them. Enter the recovery key you saved when you first set up your account.
        </p>
        <form onSubmit={recover} className="mt-4 grid gap-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            aria-label="Recovery key"
            placeholder="Recovery key"
            autoComplete="off"
            spellCheck={false}
            className="rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
          />
          <button className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">Unlock</button>
        </form>
        {state.error && <p role="alert" className="mt-2 text-sm text-red-700">{state.error}</p>}
      </div>
    );
  }

  return (
    <>
      {state.recoveryKey && <RecoveryKeyNotice value={state.recoveryKey} onDone={() => setState({ kind: "ready", key: state.key })} />}
      {children(state.key)}
    </>
  );
}

function RecoveryKeyNotice({ value, onDone }: { value: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const grouped = value.match(/.{1,4}/g)?.join(" ") ?? value;
  return (
    <div role="dialog" aria-label="Save your recovery key" className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
      <h2 className="font-semibold text-amber-900">Save your recovery key</h2>
      <p className="mt-1 text-sm text-amber-900">
        Your videos are end-to-end encrypted on this device. You&apos;ll need this key to open them on another computer or phone. We can&apos;t recover it for you.
      </p>
      <p className="mt-3 break-all rounded-lg bg-white px-3 py-2 font-mono text-sm text-slate-900" data-recovery-key={value}>
        {grouped}
      </p>
      <div className="mt-3 flex gap-2">
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
          }}
          className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-900"
        >
          {copied ? "Copied" : "Copy"}
        </button>
        <button onClick={onDone} className="rounded-lg bg-amber-900 px-3 py-1.5 text-sm font-medium text-white">I&apos;ve saved it</button>
      </div>
    </div>
  );
}
