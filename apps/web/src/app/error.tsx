"use client";

import Link from "next/link";
import { useEffect } from "react";
import { reportClientError } from "@/components/SupportChat";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError("page", error);
  }, [error]);
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl font-semibold text-slate-900">Something went wrong</h1>
      <p className="mt-2 text-sm text-slate-600">
        Any recording in progress is saved on this device and will finish uploading when you come back.
      </p>
      {error.digest && <p className="mt-2 text-xs text-slate-400">Error reference: {error.digest}</p>}
      <div className="mt-6 flex gap-3">
        <button onClick={reset} className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">Try again</button>
        <Link href="/library" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50">Go to library</Link>
      </div>
    </main>
  );
}
