import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";

const PILLARS = [
  {
    title: "Never lose a take",
    body: "Recordings upload while you talk and are backed up on your device. If the browser crashes or Wi-Fi drops, your video is recovered automatically.",
    icon: "M12 3l8 4v5c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V7z",
  },
  {
    title: "Share in a second",
    body: "Your link is ready the moment you hit stop. No “processing” screen, no waiting for a render before your client can watch.",
    icon: "M10 14l11-11M21 3l-7 18-3-8-8-3z",
  },
  {
    title: "Private by design",
    body: "Every video is encrypted on your device before it uploads. Only you, your team and the client you send it to can open it. Not even we can.",
    icon: "M6 11h12v10H6zM9 11V7a3 3 0 0 1 6 0v4",
  },
  {
    title: "Works in any browser",
    body: "Record on a computer or a phone with nothing to install. iPhone and Android apps are coming soon.",
    icon: "M7 2h10v20H7zM11 18h2",
  },
  {
    title: "Everything for each client in one place",
    body: "Send a video, add their to-dos and notes, and set email reminders, all private to you and them.",
    icon: "M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",
  },
  {
    title: "Your brand, front and centre",
    body: "On paid plans, your logo and colours are on every page and email your clients see.",
    icon: "M12 3a9 9 0 1 0 0 18c1 0 1.5-.7 1.5-1.5 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.8.7-1.5 1.5-1.5H16a5 5 0 0 0 5-5c0-4-4-7.8-9-7.8zM7.5 11h.01M10.5 7.5h.01M15 8h.01",
  },
];

const AUDIENCES = "Coaches, personal trainers, consultants, tutors, agencies, clinics and many more.";

const PRIVACY = [
  ["Encrypted on your device", "Videos, replies, to-dos and notes are locked before they leave your phone or computer. Our servers only ever hold scrambled data."],
  ["Every client gets their own copy", "Send one video to one client or a hundred. Each opens it from their own private link, and nobody sees anyone else's replies."],
  ["Staff who leave are locked out", "Remove someone from your team and every key and client link is reset, so they can't open anything again."],
];

const STEPS = [
  ["Record", "Pick screen, camera, or both. Press start."],
  ["Send", "Pick a client, or several at once. Only they can open it, from their own private link."],
  ["Reply", "Clients answer with their own video, a voice note or a message. No account needed."],
];

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 -z-10 h-[520px] bg-gradient-to-b from-brand-50 to-white" />
          <div className="mx-auto max-w-6xl px-4 pb-20 pt-20 text-center sm:px-6 sm:pt-28">
            <p className="mx-auto mb-5 inline-flex rounded-full border border-brand-100 bg-white px-3 py-1 text-xs font-medium text-brand-700">
              Crash-safe. Client-ready. Private by design.
            </p>
            <h1 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight text-slate-900 sm:text-6xl">
              One take is <span className="block text-brand-600 sm:inline">all it takes.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600">
              Every take is saved as you record, so a crash or dropped signal will never cost you the time you took to
              make it. Each recording is end-to-end encrypted and only those you send it to will have access. Your clients
              join and make use of our services for free under your subscription, while their to-dos and reminders live right
              next to your corresponding videos.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/record" className="rounded-xl bg-brand-600 px-6 py-3 font-semibold text-white shadow-sm hover:bg-brand-700">
                Record your first video, free
              </Link>
              <Link href="/pricing" className="rounded-xl border border-slate-300 bg-white px-6 py-3 font-semibold text-slate-800 hover:bg-slate-50">
                See pricing
              </Link>
            </div>
            <p className="mt-4 text-sm text-slate-500">No download. No credit card.</p>
            <p className="mx-auto mt-6 max-w-2xl text-sm font-medium text-slate-700">{AUDIENCES}</p>

            <div className="mx-auto mt-16 max-w-4xl rounded-2xl border border-slate-200 bg-white p-2 shadow-xl shadow-brand-900/5">
              <div className="relative aspect-video overflow-hidden rounded-xl bg-gradient-to-br from-slate-800 to-slate-950">
                <div className="absolute left-6 top-6 h-3 w-40 rounded bg-white/20" />
                <div className="absolute left-6 top-14 h-2 w-64 rounded bg-white/10" />
                <div className="absolute left-6 top-20 h-2 w-52 rounded bg-white/10" />
                <div className="absolute bottom-6 left-6 h-24 w-24 rounded-full border-4 border-white/80 bg-gradient-to-br from-brand-500 to-brand-700 sm:h-32 sm:w-32" />
                <div className="absolute right-6 top-6 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> Recording · 1:24
                </div>
                <div className="absolute bottom-6 right-6 rounded-lg bg-emerald-500/90 px-3 py-1.5 text-xs font-medium text-white">Saved to cloud</div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-slate-100 bg-white py-20">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
            {PILLARS.map((p) => (
              <div key={p.title}>
                <div className="mb-4 grid h-10 w-10 place-items-center rounded-lg bg-brand-50 text-brand-600">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d={p.icon} /></svg>
                </div>
                <h3 className="font-semibold text-slate-900">{p.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{p.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-slate-50 py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-center text-3xl font-semibold tracking-tight text-slate-900">Three steps. That&apos;s it.</h2>
            <ol className="mt-12 grid gap-6 sm:grid-cols-3">
              {STEPS.map(([t, b], i) => (
                <li key={t} className="rounded-2xl border border-slate-200 bg-white p-6">
                  <span className="text-sm font-semibold text-brand-600">0{i + 1}</span>
                  <h3 className="mt-2 text-lg font-semibold text-slate-900">{t}</h3>
                  <p className="mt-1 text-sm text-slate-600">{b}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="border-t border-slate-100 bg-white py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-center text-3xl font-semibold tracking-tight text-slate-900">How we keep it private</h2>
            <div className="mt-12 grid gap-6 sm:grid-cols-3">
              {PRIVACY.map(([t, b]) => (
                <div key={t} className="rounded-2xl border border-slate-200 p-6">
                  <h3 className="font-semibold text-slate-900">{t}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{b}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-brand-600 py-10 text-center text-white">
          <p className="mx-auto max-w-3xl px-4 text-lg font-medium sm:px-6">Your clients never pay, never sign up and never see third-party ads.</p>
        </section>

        <section className="py-20">
          <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
            <h2 className="text-3xl font-semibold tracking-tight text-slate-900">Ready for your whole team</h2>
            <p className="mt-4 text-slate-600">
              Studio includes 3 staff logins and Agency includes 10. Share one client list, assign clients to staff, and keep billing with the owner. Clients never need an account.
            </p>
            <p className="mt-6 font-medium text-slate-900">Free for 3 clients. Paid plans from $15 a month.</p>
            <Link href="/pricing" className="mt-6 inline-block rounded-xl bg-slate-900 px-6 py-3 font-semibold text-white hover:bg-slate-800">
              Compare plans
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
