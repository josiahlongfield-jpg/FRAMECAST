import type { Metadata } from "next";
import Link from "next/link";
import Logo from "@/components/Logo";
import { callbackFrom } from "@/lib/signInLink";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function ConfirmSignIn({ searchParams }: { searchParams: Promise<{ link?: string }> }) {
  const callback = callbackFrom((await searchParams).link);
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <Logo />
        {callback ? (
          <>
            <h1 className="mt-6 text-xl font-semibold text-slate-900">Sign in</h1>
            <p className="mt-3 text-sm text-slate-600">Press the button to finish signing in on this device.</p>
            {/* A plain link, so nothing fetches it until it's pressed. */}
            <a
              href={callback}
              rel="nofollow"
              className="mt-6 block rounded-xl bg-brand-600 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-brand-700"
              data-testid="confirm-sign-in"
            >
              Sign in
            </a>
          </>
        ) : (
          <>
            <h1 className="mt-6 text-xl font-semibold text-slate-900">This link doesn&apos;t work</h1>
            <p className="mt-3 text-sm text-slate-600">
              It may have been cut short. <Link href="/login" className="font-medium text-brand-700 underline">Ask for a new sign-in link</Link>.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
