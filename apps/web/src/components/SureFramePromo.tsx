"use client";

import { useEffect, useState } from "react";

const WAIT_SECONDS = 5;

/**
 * Shown to clients of businesses on the Free plan before a video. It is our
 * own short message, not a third-party ad: no trackers, nothing leaves the page.
 * Paid plans never show it.
 */
export default function SureFramePromo({ videoId }: { videoId: string }) {
  const seenKey = `sureframe-promo-${videoId}`;
  // Unknown until we've checked this visit's storage, so a returning viewer never sees it flash.
  const [open, setOpen] = useState<boolean | null>(null);
  const [left, setLeft] = useState(WAIT_SECONDS);

  useEffect(() => {
    let seen = false;
    try {
      seen = !!sessionStorage.getItem(seenKey);
    } catch {}
    setOpen(!seen);
  }, [seenKey]);

  useEffect(() => {
    if (!open || left <= 0) return;
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [open, left]);

  if (!open) return null;
  const close = () => {
    try {
      sessionStorage.setItem(seenKey, "1");
    } catch {}
    setOpen(false);
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="promo-title" data-testid="sureframe-promo" className="fixed inset-0 z-50 grid place-items-center bg-slate-900/70 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-2xl">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-700">Sent with SureFrame</p>
        <h2 id="promo-title" className="mt-3 text-2xl font-semibold tracking-tight text-slate-900 [text-wrap:balance]">
          Private video messages for businesses and their clients
        </h2>
        <p className="mt-3 text-sm text-slate-600">
          Record once, send to one client, get a video, voice or text reply back. Every video is end-to-end encrypted, and clients never pay.
        </p>
        <div className="mt-6 grid gap-3">
          <button
            onClick={close}
            disabled={left > 0}
            className="rounded-xl bg-brand-600 px-4 py-3 font-semibold text-white hover:bg-brand-700 disabled:bg-slate-300 disabled:text-slate-600"
          >
            {left > 0 ? `Watch your video in ${left}` : "Watch your video"}
          </button>
          <a href="/?ref=promo" target="_blank" rel="noopener" className="text-sm font-medium text-brand-700 hover:underline">
            Run a business? Try SureFrame free
          </a>
        </div>
      </div>
    </div>
  );
}
