import { z } from "zod";

/** Validation for lib/schedule.ts types. */
export const Repeat = z.object({
  every: z.number().int().min(1).max(365),
  unit: z.enum(["day", "week", "month"]),
  /** For weekly repeats: days of the week, 0 = Sunday. */
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  /** For monthly repeats: the day of the month to aim for (kept even after a short month). */
  monthDay: z.number().int().min(1).max(31).optional(),
  /** Last date (YYYY-MM-DD, inclusive) an occurrence may fall on. */
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const ReminderRule = z.object({
  amount: z.number().int().min(0).max(365),
  unit: z.enum(["minute", "hour", "day", "week"]),
  at: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
});
export const ReminderRules = z.array(ReminderRule).max(10);
