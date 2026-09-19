import "server-only";

import { headers } from "next/headers";

/**
 * Headers the Next.js layer must never forward verbatim to the backend.
 *
 * Every one of these describes "who the caller is" or "which proxy vouches for
 * them". The browser can set any of them, so passing them through would let a
 * client dictate the identity the API rate-limits and audit-logs against.
 * They are stripped on the way in and re-set from values this server actually
 * knows.
 */
export const SPOOFABLE_HEADERS = [
  "x-real-client-ip",
  "x-insightflow-proxy",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-real-ip",
] as const;

export const CLIENT_IP_HEADER = "x-real-client-ip";
export const PROXY_AUTH_HEADER = "x-insightflow-proxy";

/**
 * The browser's address, as seen by the platform in front of this server.
 *
 * On Vercel the left-most `x-forwarded-for` entry is the real client, because
 * Vercel's edge writes the header itself and overwrites anything the client
 * sent. Self-hosted behind a proxy that does not, `x-real-ip` is the usual
 * alternative. If neither is present the caller cannot be identified and we
 * say so rather than guessing — the backend then falls back to the socket
 * address, which is at least honest.
 */
export async function realClientIp(): Promise<string | null> {
  try {
    const headerList = await headers();
    const forwarded = headerList.get("x-forwarded-for");
    if (forwarded) {
      const first = forwarded.split(",")[0]?.trim();
      if (first) return first;
    }
    return headerList.get("x-real-ip")?.trim() || null;
  } catch {
    // Called outside a request scope. Identifying the caller is an
    // optimisation here, never a correctness requirement, so this degrades to
    // the backend's own view of who connected.
    return null;
  }
}

/**
 * Tell the backend who the caller is, and prove this request came from here.
 *
 * The backend is publicly reachable, so it believes the forwarded address only
 * when `PROXY_SHARED_SECRET` matches. Without the secret configured, nothing is
 * sent and the backend rate-limits on the socket address — correct, just
 * coarser, because every request then appears to come from this server.
 */
export async function applyClientIdentity(target: Headers): Promise<void> {
  for (const name of SPOOFABLE_HEADERS) target.delete(name);

  const secret = process.env.PROXY_SHARED_SECRET;
  if (!secret) return;

  const ip = await realClientIp();
  if (!ip) return;

  target.set(PROXY_AUTH_HEADER, secret);
  target.set(CLIENT_IP_HEADER, ip);
}
