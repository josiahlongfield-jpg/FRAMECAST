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
 * A customer's message. Starts a conversation when there's no token. The
 * assistant answers until a person has replied; after that, new messages go
 * to the person and the support inbox hears about each one.
 */
export const POST = handle(async (req: Request) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "Please write a message (up to 4,000 characters) and check the email address.");
  await limitByIp("support", 30, 3600);
  const { token, body, email } = parsed.data;
  const me = await currentUser().catch(() => null);

  // A token for a conversation that's since been deleted just starts a new one.
  let ticket = token ? await load(token).catch(() => null) : null;
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

  const say = (body: string) => db.supportMessage.create({ data: { ticketId: ticket.id, author: "ASSISTANT", body } });

  if (ticket.status === "ANSWERED") {
    // A person is talking with them now: pass it on rather than have the assistant cut in.
    await handToHuman(ticket.id, null, ticket.urgent);
    await say("Thanks, I've added that to your conversation with the team. They'll reply here and by email.");
  } else if (assistantEnabled()) {
    // Before a person has replied, the assistant keeps helping, even once the team has been told.
    const waiting = ticket.status === "NEEDS_HUMAN";
    if (ticket.status === "CLOSED") await db.supportTicket.update({ where: { id: ticket.id }, data: { status: "OPEN" } });
    try {
      const { handedOver } = await answer(ticket.id);
      if (waiting && !handedOver) await handToHuman(ticket.id, null, ticket.urgent);
    } catch (e) {
      const err = e as { status?: number; message?: string; error?: unknown };
      console.error("[support] assistant failed", JSON.stringify({ ticket: ticket.id, status: err.status, message: err.message?.slice(0, 500), error: err.error }));
      await handToHuman(ticket.id, waiting ? null : "The assistant had a technical problem answering. Please reply to the customer.", ticket.urgent);
      await say("Sorry, I hit a problem answering that. I've passed your message to the team, and a person will reply.");
    }
  } else {
    await handToHuman(ticket.id, ticket.status === "NEEDS_HUMAN" ? null : "New message (the assistant is switched off).", ticket.urgent);
    await say("Thanks. Your message is with the team, and a person will reply.");
  }
  const fresh = await load(ticket.accessToken);
  return Response.json({ token: fresh.accessToken, ...publicTicket(fresh) });
});
