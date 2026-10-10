import { exportAccount } from "@/lib/account";
import { currentUser, handle, HttpError } from "@/lib/session";
import { limitByIp } from "@/lib/rateLimit";

export const GET = handle(async () => {
  await limitByIp("export", 10, 3600);
  // Paused staff can still download their own data; paused teams are left out of it (lib/account.ts).
  const me = await currentUser();
  if (!me) throw new HttpError(401, "Sign in required");
  const { user } = me;
  const data = await exportAccount(user.id);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="sureframe-export-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
});
