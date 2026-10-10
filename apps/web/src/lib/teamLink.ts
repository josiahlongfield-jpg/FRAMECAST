/** Adds ?ws= to a path in a team email, so it opens that team (see followTeamLink in session.ts). */
export const teamPath = (path: string, workspaceId: string) => `${path}${path.includes("?") ? "&" : "?"}ws=${workspaceId}`;
