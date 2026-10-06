import { exportKey, importKey } from "./crypto";

/**
 * Keys kept on this device only. The team key unlocks everything the team
 * owns; a client key unlocks what was sent to that client.
 */
const PREFIX = "framecast.key.";

function get(name: string) {
  try {
    return localStorage.getItem(PREFIX + name);
  } catch {
    return null;
  }
}

function set(name: string, value: string) {
  try {
    localStorage.setItem(PREFIX + name, value);
  } catch {
    /* storage blocked; the key stays usable for this page only */
  }
}

export async function loadKey(name: string) {
  const text = get(name);
  if (!text) return null;
  try {
    return await importKey(text);
  } catch {
    return null;
  }
}

export async function saveKey(name: string, key: CryptoKey) {
  set(name, await exportKey(key));
}

export const teamKeyName = (workspaceId: string) => `team:${workspaceId}`;
export const clientKeyName = (clientId: string) => `client:${clientId}`;
