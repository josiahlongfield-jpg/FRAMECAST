import { PrismaClient, type Workspace as WorkspaceRow } from "@prisma/client";

// The logo's bytes are only needed by the logo route (which selects them), so ordinary
// workspace reads, including the one on every signed-in request, don't carry them.
const makeClient = () => new PrismaClient({ omit: { workspace: { brandLogo: true } } });

/** A workspace as ordinary reads return it: everything but the logo's bytes. */
export type Workspace = Omit<WorkspaceRow, "brandLogo">;

const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof makeClient> };

export const db = globalForPrisma.prisma ?? makeClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
