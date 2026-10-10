"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { reportClientError } from "@/lib/clientError";

/** Pages only signed-in staff use; everywhere else (client pages, the public site) gets a neutral message. */
const APP_PAGES = ["/library", "/record", "/clients", "/team", "/settings", "/support"];

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const path = usePathname() ?? "/";
  useEffect(() => {
    reportClientError("page", error);
  }, [error]);
  const inApp = APP_PAGES.some((p) => path === p || path.startsWith(`${p}/`));
  const records = path.startsWith("/record") || path.startsWith("/v/");
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl font-semibold text-slate-900">Something went wrong</h1>
      <p className="mt-2 text-sm text-slate-600">
        {records
          ? "A recording in progress is kept in this browser and finishes uploading next time you open SureFrame here."
          : "Please try again. If it keeps happening, let us know."}
      </p>
      {error.digest && <p className="mt-2 text-xs text-slate-400">Error reference: {error.digest}</p>}
      <div className="mt-6 flex gap-3">
        <button onClick={reset} className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">Try again</button>
        <Link href={inApp ? "/library" : "/"} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50">
          {inApp ? "Go to library" : "Go home"}
        </Link>
      </div>
    </main>
  );
}
