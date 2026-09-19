import { NextResponse } from "next/server";

import { BACKEND_URL, API_PREFIX } from "@/lib/backend";
import { applyClientIdentity } from "@/lib/client-ip";
import { setSessionCookies, type TokenBundle } from "@/lib/session";

/**
 * Exchange credentials for a session.
 *
 * The tokens returned by the backend are written to httpOnly cookies here and
 * never sent to the browser in the response body — a token in JavaScript's
 * reach is a token an XSS bug can steal.
 */
export async function POST(request: Request) {
  let credentials: { email?: string; password?: string };
  try {
    credentials = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "invalid_request", message: "That request could not be read." } },
      { status: 400 },
    );
  }

  // The rate limit that protects this endpoint is only meaningful if the
  // backend knows who is calling. See lib/client-ip.ts.
  const upstreamHeaders = new Headers({ "Content-Type": "application/json" });
  await applyClientIdentity(upstreamHeaders);

  let response: Response;
  try {
    response = await fetch(`${BACKEND_URL}${API_PREFIX}/auth/login`, {
      method: "POST",
      headers: upstreamHeaders,
      body: JSON.stringify(credentials),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "backend_unreachable",
          message: "We could not reach the analysis service.",
          hint: "Check that the backend is running, then try again.",
        },
      },
      { status: 503 },
    );
  }

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    return NextResponse.json(
      body ?? {
        error: { code: "login_failed", message: "That email address or password is incorrect." },
      },
      { status: response.status },
    );
  }

  const bundle = body as TokenBundle;
  await setSessionCookies(bundle);

  return NextResponse.json({
    user: bundle.user,
    workspaces: bundle.workspaces,
  });
}
