"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { isSupportAgent, staffReply } from "@/lib/support/tickets";

async function requireAgent() {
  const session = await auth();
  if (!isSupportAgent(session?.user?.email)) redirect("/library");
}

export async function reply(ticketId: string, form: FormData) {
  await requireAgent();
  const body = String(form.get("body") ?? "").trim().slice(0, 8000);
  if (!body) return;
  const ticket = await db.supportTicket.findUniqueOrThrow({ where: { id: ticketId }, include: { user: { select: { email: true } } } });
  await staffReply(ticket, body);
  revalidatePath(`/support/${ticketId}`);
}

export async function setStatus(ticketId: string, status: "CLOSED" | "OPEN") {
  await requireAgent();
  await db.supportTicket.update({ where: { id: ticketId }, data: { status, ...(status === "CLOSED" ? { urgent: false } : {}) } });
  revalidatePath(`/support/${ticketId}`);
  revalidatePath("/support");
}

/** Permanently removes one conversation (for test chats and spam). */
export async function deleteTicket(ticketId: string) {
  await requireAgent();
  await db.supportTicket.deleteMany({ where: { id: ticketId } });
  revalidatePath("/support");
  redirect("/support?show=all");
}

/** Permanently removes every conversation. The form must carry confirm=DELETE. */
export async function deleteAllTickets(form: FormData) {
  await requireAgent();
  if (String(form.get("confirm") ?? "").trim() !== "DELETE") redirect("/support?show=all&error=confirm");
  await db.supportTicket.deleteMany({});
  revalidatePath("/support");
  redirect("/support?show=all&cleared=1");
}
