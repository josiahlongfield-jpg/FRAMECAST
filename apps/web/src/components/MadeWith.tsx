import Link from "next/link";

/** Small credit on pages clients see, so a business's branding never hides where it was made. */
export default function MadeWith() {
  return (
    <footer className="py-8 text-center text-xs text-slate-400">
      <Link href="/?ref=badge" className="inline-flex items-center gap-1.5 hover:text-slate-600">
        <span className="grid h-4 w-4 place-items-center rounded bg-slate-300 text-white">
          <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" /></svg>
        </span>
        Made with SureFrame
      </Link>
    </footer>
  );
}
