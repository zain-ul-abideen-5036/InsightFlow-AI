/**
 * Server-side session handling.
 *
 * The Next.js layer owns the browser session. It exchanges credentials with the
 * FastAPI backend, then stores the resulting tokens in httpOnly cookies and
 * attaches them to proxied requests as a bearer token.
 *
 * Why this split rather than letting the backend set cookies directly: the
 * cookie stays first-party to the Next.js origin, so it works on Vercel with
 * the API on another domain, needs no `SameSite=None` (which Safari's tracking
 * prevention blocks), and requires no CORS credentials. The backend stays a
 * clean stateless bearer-token API that is trivial to test.
 */

import "server-only";

import { cookies, headers } from "next/headers";

export const ACCESS_COOKIE = "if_session";
export const REFRESH_COOKIE = "if_refresh";
export const WORKSPACE_COOKIE = "if_workspace";

export interface SessionUser {
  id: string;
  email: string;
  full_name: string;
  onboarding_completed: boolean;
  created_at: string;
}

export interface SessionWorkspace {
  id: string;
  name: string;
  slug: string;
  business_type: string;
  currency: string;
  timezone: string;
  onboarding_step: number;
  created_at: string;
}

export interface TokenBundle {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: SessionUser;
  workspaces: SessionWorkspace[];
}

/**
 * Whether session cookies should carry the `Secure` flag.
 *
 * Derived from the protocol the request actually arrived on, not from
 * `NODE_ENV`. Keying it off the build mode looks equivalent and is not: a
 * production build served over plain HTTP — a self-hosted deployment, or
 * `next start` on localhost — would set `Secure` cookies that no compliant
 * client ever sends back, so every request appears unauthenticated with nothing
 * anywhere to explain why.
 *
 * Set `COOKIE_SECURE` explicitly for deployments that terminate TLS somewhere
 * the forwarded headers do not describe.
 */
async function secureCookiesRequired(): Promise<boolean> {
  const override = process.env.COOKIE_SECURE;
  if (override === "true") return true;
  if (override === "false") return false;

  try {
    const headerList = await headers();

    // Set by Vercel and by any sane reverse proxy.
    const forwarded = headerList.get("x-forwarded-proto");
    if (forwarded) return forwarded.split(",")[0]!.trim() === "https";

    // No proxy header: a local host is served over plain HTTP, anything else
    // in a production build is assumed to be behind TLS.
    const host = headerList.get("host") ?? "";
    const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host);
    return !isLocal && process.env.NODE_ENV === "production";
  } catch {
    return process.env.NODE_ENV === "production";
  }
}

async function baseCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: await secureCookiesRequired(),
    path: "/",
  };
}

export async function setSessionCookies(bundle: TokenBundle) {
  const store = await cookies();
  const options = await baseCookieOptions();

  store.set(ACCESS_COOKIE, bundle.access_token, {
    ...options,
    // A short-lived access token, refreshed transparently by the proxy.
    maxAge: bundle.expires_in,
  });

  store.set(REFRESH_COOKIE, bundle.refresh_token, {
    ...options,
    maxAge: 60 * 60 * 24 * 30,
  });

  const first = bundle.workspaces[0];
  if (first) {
    store.set(WORKSPACE_COOKIE, first.id, {
      ...options,
      // Readable by the client so the shell can render without a round trip.
      httpOnly: false,
      maxAge: 60 * 60 * 24 * 365,
    });
  }
}

export async function clearSessionCookies() {
  const store = await cookies();
  const options = await baseCookieOptions();
  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE, WORKSPACE_COOKIE]) {
    store.set(name, "", { ...options, httpOnly: name !== WORKSPACE_COOKIE, maxAge: 0 });
  }
}

export async function getAccessToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(ACCESS_COOKIE)?.value ?? null;
}

export async function getRefreshToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(REFRESH_COOKIE)?.value ?? null;
}

export async function getActiveWorkspaceId(): Promise<string | null> {
  const store = await cookies();
  return store.get(WORKSPACE_COOKIE)?.value ?? null;
}

export async function setActiveWorkspaceId(id: string) {
  const store = await cookies();
  store.set(WORKSPACE_COOKIE, id, {
    ...(await baseCookieOptions()),
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function updateAccessToken(token: string, expiresIn: number) {
  const store = await cookies();
  store.set(ACCESS_COOKIE, token, { ...(await baseCookieOptions()), maxAge: expiresIn });
}
