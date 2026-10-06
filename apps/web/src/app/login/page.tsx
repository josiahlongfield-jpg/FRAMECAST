import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Logo from "@/components/Logo";
import { auth, authProviders, signIn } from "@/auth";

export const metadata: Metadata = { title: "Sign in" };

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const redirectTo = next?.startsWith("/") && !next.startsWith("//") ? next : "/library";
  if ((await auth())?.user) redirect(redirectTo);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <Logo />
        <h1 className="mt-6 text-xl font-semibold text-slate-900">Sign in to start recording</h1>
        <div className="mt-6 grid gap-3">
          {authProviders.some((p) => p.id === "google") && (
            <form action={async () => { "use server"; await signIn("google", { redirectTo }); }}>
              <button className="w-full rounded-xl border border-slate-300 px-4 py-3 font-medium hover:bg-slate-50">Continue with Google</button>
            </form>
          )}
          {authProviders.some((p) => p.id === "dev") && (
            <form
              className="grid gap-3"
              action={async (fd: FormData) => {
                "use server";
                await signIn("dev", { email: fd.get("email"), redirectTo });
              }}
            >
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-slate-700">Work email</span>
                <input name="email" type="email" required placeholder="you@company.com" className="rounded-lg border border-slate-300 px-3 py-2" />
              </label>
              <button className="rounded-xl bg-brand-600 px-4 py-3 font-semibold text-white hover:bg-brand-700">Continue</button>
            </form>
          )}
          {authProviders.length === 0 && (
            <p className="text-sm text-slate-600">No sign-in method is configured. Set AUTH_GOOGLE_ID or AUTH_DEV_LOGIN in your environment.</p>
          )}
        </div>
        <p className="mt-6 text-xs text-slate-500">By continuing you agree to our Terms and Privacy Policy.</p>
      </div>
    </main>
  );
}
