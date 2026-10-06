import type { Item } from "@prisma/client";

export type ItemDTO = {
  id: string;
  kind: "TASK" | "NOTE";
  body: string; // ciphertext
  done: boolean;
  dueAt: string | null;
  shared: boolean;
  authorName: string;
  createdAt: string;
};

export const itemDTO = (i: Item): ItemDTO => ({
  id: i.id,
  kind: i.kind,
  body: i.body,
  done: i.done,
  dueAt: i.dueAt?.toISOString() ?? null,
  shared: i.shared,
  authorName: i.authorName,
  createdAt: i.createdAt.toISOString(),
});
