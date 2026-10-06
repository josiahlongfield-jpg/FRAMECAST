import { cookies } from "next/headers";
import type { Client, Video } from "@prisma/client";
import { db } from "@/lib/db";
import { currentUser, HttpError } from "@/lib/session";

/** Cookie a client's personal link sets, one per workspace they belong to. */
export const clientCookie = (workspaceId: string) => `fc_client_${workspaceId}`;

export type Viewer =
  | { kind: "member"; userId: string; name: string }
  | { kind: "client"; client: Client; name: string };

/**
 * Who is looking at this video, if they are allowed to. Videos are private:
 * members of the owning workspace can see everything, and a client can see
 * only videos sent to them (plus the replies inside those conversations).
 * There is no public access.
 */
export async function viewerFor(video: Video): Promise<Viewer | null> {
  const root = video.replyToId ? await db.video.findUnique({ where: { id: video.replyToId } }) : video;
  if (!root) return null;

  const me = await currentUser();
  if (me && me.workspace.id === root.workspaceId) {
    return { kind: "member", userId: me.user.id, name: me.user.name ?? me.user.email.split("@")[0] };
  }

  const token = (await cookies()).get(clientCookie(root.workspaceId))?.value;
  if (!token || !root.clientId) return null;
  const client = await db.client.findUnique({ where: { token } });
  if (!client || client.removedAt || client.id !== root.clientId) return null;
  return { kind: "client", client, name: client.name };
}

/** Load a video and require that the caller may view it (404 otherwise, so ids don't leak). */
export async function viewableVideo(id: string) {
  const video = await db.video.findUnique({ where: { id } });
  if (!video) throw new HttpError(404, "Video not found");
  const viewer = await viewerFor(video);
  if (!viewer) throw new HttpError(404, "Video not found");
  return { video, viewer };
}

/** The client signed in on this device for a workspace (via their personal link), if any. */
export async function clientFromCookie(workspaceId: string) {
  const token = (await cookies()).get(clientCookie(workspaceId))?.value;
  if (!token) return null;
  const client = await db.client.findUnique({ where: { token } });
  return client && !client.removedAt && client.workspaceId === workspaceId ? client : null;
}

/** Either a workspace member, or the client named by `clientId` on their own device. */
export async function memberOrClient(clientId: string | null) {
  const me = await currentUser();
  if (clientId) {
    const client = await db.client.findUnique({ where: { id: clientId } });
    if (!client || client.removedAt) throw new HttpError(404, "Not found");
    if (me && me.workspace.id === client.workspaceId) return { kind: "member" as const, me, workspaceId: client.workspaceId };
    const self = await clientFromCookie(client.workspaceId);
    if (self?.id === client.id) return { kind: "client" as const, client: self, workspaceId: client.workspaceId };
    throw new HttpError(404, "Not found");
  }
  if (!me) throw new HttpError(401, "Sign in required");
  return { kind: "member" as const, me, workspaceId: me.workspace.id };
}
