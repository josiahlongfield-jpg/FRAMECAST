import type { Item } from "@prisma/client";
import type { Repeat as RepeatT, ReminderRule } from "@/lib/schedule";
import { Repeat, ReminderRules } from "@/lib/scheduleSchema";

export type ItemDTO = {
  id: string;
  kind: "TASK" | "NOTE";
  body: string; // ciphertext
  done: boolean;
  dueAt: string | null;
  shared: boolean;
  repeat: RepeatT | null;
  reminders: ReminderRule[];
  remindClient: boolean;
  remindTeam: boolean;
  authorName: string;
  createdAt: string;
};

export const itemDTO = (i: Item): ItemDTO => {
  const repeat = Repeat.safeParse(i.repeat);
  const reminders = ReminderRules.safeParse(i.reminders);
  return {
    id: i.id,
    kind: i.kind,
    body: i.body,
    done: i.done,
    dueAt: i.dueAt?.toISOString() ?? null,
    shared: i.shared,
    repeat: repeat.success ? repeat.data : null,
    reminders: reminders.success ? reminders.data : [],
    remindClient: i.remindClient,
    remindTeam: i.remindTeam,
    authorName: i.authorName,
    createdAt: i.createdAt.toISOString(),
  };
};
