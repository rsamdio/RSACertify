import { firebasePublicConfig } from "@/lib/firebase-config";

const RTDB_BASE = firebasePublicConfig.databaseURL.replace(/\/$/, "");

/**
 * Authenticated RTDB read over HTTPS REST (same transport as public server pages).
 * Prefer this in the browser admin UI over the WebSocket SDK when a one-shot
 * read is enough — avoids CSP/connect hangs and long-lived socket setup.
 */
export async function fetchAuthedRtdbJson<T>(
  path: string,
  idToken: string,
  timeoutMs = 15000
): Promise<T | null> {
  const clean = path.replace(/^\//, "").replace(/\.json$/, "");
  const url = `${RTDB_BASE}/${clean}.json?auth=${encodeURIComponent(idToken)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" }
    });
    if (!res.ok) {
      throw new Error(`RTDB REST failed (${res.status}) for ${clean}`);
    }
    return (await res.json()) as T | null;
  } finally {
    clearTimeout(timer);
  }
}
