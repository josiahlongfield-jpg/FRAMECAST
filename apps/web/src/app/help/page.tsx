import type { Metadata } from "next";
import { auth } from "@/auth";
import SiteHeader from "@/components/SiteHeader";
import { ChatBoundary, SupportChat } from "@/components/SupportChat";

export const metadata: Metadata = {
  title: "Help",
  description: "Get help with recording, sending videos, clients, billing and your recovery key.",
};

export default async function Help() {
  const signedIn = !!(await auth())?.user;
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">How can we help?</h1>
        <p className="mt-2 text-slate-600">Our assistant answers straight away and passes anything it can&rsquo;t sort out to a person on the team.</p>
        <p className="mt-2 text-sm text-slate-500" data-testid="reply-time">
          When a person is needed, we reply within 2 business days (Queensland, Australia time), by email and here in the chat.
        </p>
        <div className="mt-8 flex h-[65vh] min-h-[420px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <ChatBoundary>
            <SupportChat signedIn={signedIn} className="flex-1" />
          </ChatBoundary>
        </div>
      </main>
    </>
  );
}
