"use client";

import { useState } from "react";

type Props = {
  enabled: boolean;
  /** On a paid plan (or given free), so it can be switched on. */
  canEnable: boolean;
  /** Price for this workspace's plan, e.g. "$15 per month"; null when given free. */
  priceLabel: string | null;
  usage: { used: number; limit: number } | null;
};

/** Settings > Billing: the AI transcripts and summaries add-on, with exactly what leaves the device. */
export default function AiAssistToggle({ enabled, canEnable, priceLabel, usage }: Props) {
  const [on, setOn] = useState(enabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function toggle() {
    if (!on && priceLabel && !confirm(`Add AI transcripts and summaries for ${priceLabel}? It's added to your subscription today.`)) return;
    setBusy(true);
    setError(undefined);
    const res = await fetch("/api/billing/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !on }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "Could not change AI summaries");
    setOn(data.aiAssist);
  }

  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6" data-testid="ai-assist">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-semibold text-slate-900">AI transcripts and summaries</p>
          <p className="mt-1 text-sm text-slate-600">
            Each video gets a transcript and a short summary with key points and action items, shown under the video to your team and the client it was sent to.
          </p>
          <ul className="mt-3 space-y-1 text-sm text-slate-600">
            <li>• The transcript is made on your own device. Audio never leaves your device.</li>
            <li>• The transcript text is sent to Anthropic&apos;s Claude to write the summary. Anthropic doesn&apos;t train its models on it, and we don&apos;t keep a readable copy.</li>
            <li>• The transcript and summary are then end-to-end encrypted like your replies and notes.</li>
            <li>• Your clients see a short note that you use AI summaries. Let them know, and get their consent where your local rules require it.</li>
            <li>• Automatic transcripts and AI summaries can contain mistakes.</li>
          </ul>
          <p className="mt-3 text-xs text-slate-500">
            {!canEnable && !on ? "Available with a paid subscription (not on Free)." : priceLabel ? `${priceLabel}, optional.` : "Included free with your plan."}
            {usage && ` ${usage.used} of ${usage.limit} summaries used this month.`}
          </p>
        </div>
        <button
          role="switch"
          aria-checked={on}
          aria-label="AI transcripts and summaries"
          onClick={toggle}
          disabled={busy || (!on && !canEnable)}
          className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50 ${on ? "bg-brand-600" : "bg-slate-300"}`}
        >
          <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${on ? "left-6" : "left-1"}`} />
        </button>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    </div>
  );
}
