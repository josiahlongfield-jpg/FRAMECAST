import type { Metadata } from "next";
import Link from "next/link";
import Logo from "@/components/Logo";

export const metadata: Metadata = { title: "Check your email" };

export default function CheckEmail() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <Logo />
        <h1 className="mt-6 text-xl font-semibold text-slate-900">Check your email</h1>
        <p className="mt-3 text-sm text-slate-600">
          We sent you a sign-in link. Open it on this device to continue. It works once and expires in 24 hours.
        </p>
        <p className="mt-4 text-sm text-slate-500">
          Nothing there? Check your spam folder, or <Link href="/login" className="font-medium text-brand-700 underline">try again</Link>.
        </p>
      </div>
    </main>
  );
}
