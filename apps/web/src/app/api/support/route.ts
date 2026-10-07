import { z } from "zod";
import { db } from "@/lib/db";
import { handle, HttpError, currentUser } from "@/lib/session";
import { limitByIp, rateLimit } from "@/lib/rateLimit";
import { answer, assistantEnabled } from "@/lib/support/assistant";
import { handToHuman, newAccessToken, publicTicket } from "@/lib/support/tickets";

const MAX_MESSAGES = 60;
const Body = z.object({
  token: z.string().min(20).max(64).optional(),
  body: z.string().trim().min(1).max(4000),
  email: z.string().trim().email().max(254).optional(),
});

async function load(token: string) {
  const ticket = await db.supportTicket.findUnique({ where: { accessToken: token }, include: { messages: { orderBy: { createdAt: "asc" } } } });
  if (!ticket) throw new HttpError(404, "Conversation not found");
  return ticket;
}

/** The conversation for the token the browser holds (checked for a person's reply). */
export const GET = handle(async (req: Request) => {
  await limitByIp("support-read", 120, 600);
  const token = req.headers.get("x-support-token");
  if (!token) throw new HttpError(400, "Missing conversation");
  return Response.json(publicTicket(await load(token)));
});

/**
 * A customer's message. Starts a conversation when there's no token. While the
 * assistant has it, the assistant answers; once a person is involved, new
 * messages wait for them and the support inbox hears about it.
 */
export const POST = handle(async (req: Request) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "Please write a message (up to 4,000 characters) and check the email address.");
  await limitByIp("support", 30, 3600);
  const { token, body, email } = parsed.data;
  const me = await currentUser().catch(() => null);

  let ticket = token ? await load(token) : null;
  if (!ticket) {
    ticket = await db.supportTicket.create({
      data: { accessToken: newAccessToken(), userId: me?.user.id, workspaceId: me?.workspace.id, email: me ? null : email },
      include: { messages: true },
    });
  } else if (email && !ticket.email && !ticket.userId) {
    await db.supportTicket.update({ where: { id: ticket.id }, data: { email } });
  }
  if (ticket.messages.length >= MAX_MESSAGES) throw new HttpError(429, "This conversation is very long. Please start a new one.");
  await rateLimit(`support:ticket:${ticket.id}`, 20, 600);
  await db.supportMessage.create({ data: { ticketId: ticket.id, author: "CUSTOMER", body } });

  if (ticket.status === "OPEN" || ticket.status === "CLOSED") {
    if (ticket.status === "CLOSED") await db.supportTicket.update({ where: { id: ticket.id }, data: { status: "OPEN" } });
    if (assistantEnabled()) {
      try {
        await answer(ticket.id);
      } catch (e) {
        const err = e as { status?: number; message?: string; error?: unknown };
        console.error("[support] assistant failed", JSON.stringify({ ticket: ticket.id, status: err.status, message: err.message?.slice(0, 500), error: err.error }));
        await handToHuman(ticket.id, "The assistant had a technical problem answering. Please reply to the customer.", false);
        await db.supportMessage.create({ data: { ticketId: ticket.id, author: "ASSISTANT", body: "Sorry, I hit a problem answering that. I've passed your message to the team, and a person will reply." } });
      }
    } else {
      await handToHuman(ticket.id, "New message (the assistant is switched off).", false);
      await db.supportMessage.create({ data: { ticketId: ticket.id, author: "ASSISTANT", body: "Thanks. Your message is with the team, and a person will reply." } });
    }
  } else {
    // A person is handling it: tell them there's more, without the assistant jumping back in.
    await handToHuman(ticket.id, null, ticket.urgent);
  }
  const fresh = await load(ticket.accessToken);
  return Response.json({ token: fresh.accessToken, ...publicTicket(fresh) });
});
