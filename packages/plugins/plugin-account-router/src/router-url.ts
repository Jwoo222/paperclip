/**
 * The only accepted router UI addresses: absolute https URLs, or http on
 * loopback. No credentials in the URL, no other schemes. Anything else is
 * treated as not configured. Shared by the worker (config validation) and the
 * UI (defence in depth before rendering a link).
 */
export const ROUTER_URL_MAX_LENGTH = 2048;

export function safeRouterUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > ROUTER_URL_MAX_LENGTH) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "[::1]";
  if (url.protocol === "https:" || (url.protocol === "http:" && loopback)) return url.toString();
  return null;
}
