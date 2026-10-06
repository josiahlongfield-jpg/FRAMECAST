import { exportAccount } from "@/lib/account";
import { handle, requireUser } from "@/lib/session";
import { limitByIp } from "@/lib/rateLimit";

export const GET = handle(async () => {
  await limitByIp("export", 10, 3600);
  const { user } = await requireUser();
  const data = await exportAccount(user.id);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="sureframe-export-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
});
