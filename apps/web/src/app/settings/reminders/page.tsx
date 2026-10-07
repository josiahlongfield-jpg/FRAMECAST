import type { Metadata } from "next";
import AppHeader from "@/components/AppHeader";
import ReminderSettings from "@/components/ReminderSettings";
import { PLANS } from "@/lib/plans";
import { workspaceReminderDefaults } from "@/lib/reminders";
import { requirePageUser } from "@/lib/session";

export const metadata: Metadata = { title: "Reminders" };

export default async function RemindersSettings() {
  const { user, workspace, role } = await requirePageUser("/settings/reminders");
  const d = workspaceReminderDefaults(workspace);
  return (
    <>
      <AppHeader email={user.email} plan={PLANS[workspace.plan].name} />
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Reminders</h1>
        <p className="mt-1 text-sm text-slate-500">
          Choose how your business appears in reminder emails and which reminders new to-dos start with. You can still change them on any to-do.
        </p>
        {role === "MEMBER" ? (
          <p className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Ask an owner or admin of {workspace.name} to change these settings.</p>
        ) : (
        <ReminderSettings
          initial={{
            name: workspace.name,
            timezone: workspace.timezone,
            reminderDefaults: d.reminders,
            remindClientDefault: d.remindClient,
            remindTeamDefault: d.remindTeam,
            reminderMessage: workspace.reminderMessage ?? "",
            reminderReplyTo: workspace.reminderReplyTo ?? "",
          }}
        />
        )}
      </main>
    </>
  );
}
