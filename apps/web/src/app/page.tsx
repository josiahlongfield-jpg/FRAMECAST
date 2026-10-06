import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { BRAND } from "@/lib/brand";

const PILLARS = [
  {
    title: "Never lose a take",
    body: "Recordings upload while you talk and are backed up on your device. If the browser crashes or Wi-Fi drops, your video is recovered automatically.",
    icon: "M12 3l8 4v5c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V7z",
  },
  {
    title: "Share in a second",
    body: "Your link is ready the moment you hit stop. No “processing” screen, no waiting for a render before your teammate can watch.",
    icon: "M10 14l11-11M21 3l-7 18-3-8-8-3z",
  },
  {
    title: "Crisp on every screen",
    body: "Up to 4K screen capture with adaptive streaming, so viewers get sharp text on desktop and smooth playback on a phone.",
    icon: "M3 5h18v12H3zM8 21h8M12 17v4",
  },
  {
    title: "Web, iPhone and Android",
    body: "Record from any browser with nothing to install, or from our native mobile apps. Your library stays in sync everywhere.",
    icon: "M7 2h10v20H7zM11 18h2",
  },
];

const STEPS = [
  ["Record", "Pick screen, camera, or both. Press start."],
  ["Share", "Copy the link. It works instantly for anyone you send it to."],
  ["Reply", "Viewers answer with their own video, a voice note or a message. No account needed."],
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
              Async video for teams that can&apos;t afford a lost recording
            </p>
            <h1 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight text-slate-900 sm:text-6xl">
              Say it once on video. <span className="text-brand-600">Skip the meeting.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600">
              {BRAND.name} records your screen and camera in one click and gives you a link the second you stop.
              Built from the ground up for reliability, so the video you recorded is the video your team sees.
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
          <div className="mx-auto grid max-w-6xl gap-8 px-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
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

        <section className="py-20">
          <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
            <h2 className="text-3xl font-semibold tracking-tight text-slate-900">Ready for your whole team</h2>
            <p className="mt-4 text-slate-600">
              Workspaces, shared libraries, SSO and admin controls on the Business plan. Viewers never need an account or a seat.
            </p>
            <Link href="/pricing" className="mt-8 inline-block rounded-xl bg-slate-900 px-6 py-3 font-semibold text-white hover:bg-slate-800">
              Compare plans
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
