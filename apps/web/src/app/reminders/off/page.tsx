import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import Logo from "@/components/Logo";
import { db } from "@/lib/db";
import { validUnsubscribe } from "@/lib/reminders";

export const metadata: Metadata = { title: "Email reminders" };

/**
 * Opened from "Stop these reminders" in a reminder email; no sign-in needed.
 * It asks for a click rather than acting on page load, because email
 * security scanners open links and would otherwise switch reminders off.
 */
export default async function RemindersOff({ searchParams }: { searchParams: Promise<{ c?: string; s?: string; on?: string }> }) {
  const { c, s } = await searchParams;
  const ok = !!c && !!s && validUnsubscribe(c, s);
  const client = ok ? await db.client.findUnique({ where: { id: c }, include: { workspace: { select: { name: true } } } }) : null;

  async function turnOn() {
    "use server";
    if (!c || !s || !validUnsubscribe(c, s)) return;
    await db.client.update({ where: { id: c }, data: { remindersOff: false } });
    revalidatePath("/reminders/off");
  }
  async function turnOff() {
    "use server";
    if (!c || !s || !validUnsubscribe(c, s)) return;
    await db.client.update({ where: { id: c }, data: { remindersOff: true } });
    revalidatePath("/reminders/off");
  }
  const fresh = client ? await db.client.findUnique({ where: { id: client.id } }) : null;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-xl items-center px-4"><Logo href="/" /></div>
      </header>
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        {!client ? (
          <p className="text-slate-600">This link isn&apos;t valid. Use the link from your most recent reminder email.</p>
        ) : fresh?.remindersOff ? (
          <>
            <h1 className="text-2xl font-semibold text-slate-900">Reminders turned off</h1>
            <p className="mt-2 text-slate-600">You won&apos;t get reminder emails from {client.workspace.name} any more.</p>
            <form action={turnOn} className="mt-6">
              <button className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50">Turn them back on</button>
            </form>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold text-slate-900">Stop reminder emails?</h1>
            <p className="mt-2 text-slate-600">You&apos;ll stop getting to-do reminders from {client.workspace.name}. You can turn them back on any time.</p>
            <form action={turnOff} className="mt-6">
              <button className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">Stop reminders</button>
            </form>
          </>
        )}
      </main>
    </div>
  );
}
