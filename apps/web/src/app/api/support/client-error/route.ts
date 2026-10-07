import { limitByIp } from "@/lib/rateLimit";

/** Browser-side errors from the help chat, written to the logs for diagnosis. */
export async function POST(req: Request) {
  try {
    await limitByIp("client-error", 20, 3600);
    const text = (await req.text()).slice(0, 4000);
    console.log("[support] client error", text);
  } catch {}
  return new Response(null, { status: 204 });
}
