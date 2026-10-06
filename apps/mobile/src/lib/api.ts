import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";

export const API_URL: string =
  process.env.EXPO_PUBLIC_API_URL ?? (Constants.expoConfig?.extra?.apiUrl as string) ?? "http://localhost:3000";

const SESSION_KEY = "framecast.session";

type Session = { cookie: string; token: string };
let cached: Session | null | undefined;

export async function getSession(): Promise<Session | null> {
  if (cached !== undefined) return cached;
  const raw = await SecureStore.getItemAsync(SESSION_KEY);
  cached = raw ? (JSON.parse(raw) as Session) : null;
  return cached;
}

/** Sign in through the web app in a browser sheet; it hands the session back via framecast://auth. */
export async function signIn(): Promise<boolean> {
  const res = await WebBrowser.openAuthSessionAsync(`${API_URL}/mobile/handoff`, "framecast://auth");
  if (res.type !== "success") return false;
  const params = new URL(res.url).searchParams;
  const cookie = params.get("cookie");
  const token = params.get("token");
  if (!cookie || !token) return false;
  cached = { cookie, token };
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(cached));
  return true;
}

export async function signOut() {
  cached = null;
  await SecureStore.deleteItemAsync(SESSION_KEY);
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const session = await getSession();
  const headers = new Headers(init.headers);
  if (session) headers.set("Cookie", `${session.cookie}=${session.token}`);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(init.json);
  }
  const res = await fetch(API_URL + path, { ...init, headers, body });
  if (res.status === 401) await signOut();
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export type Video = {
  id: string;
  title: string;
  status: string;
  durationMs: number | null;
  hlsUrl: string | null;
  rawUrl: string;
  thumbnailUrl: string | null;
  viewCount: number;
  createdAt: string;
};

export const shareUrl = (id: string) => `${API_URL}/v/${id}`;
