import { NextResponse } from "next/server";

import { API_PREFIX, BACKEND_URL } from "@/lib/backend";
import { applyClientIdentity } from "@/lib/client-ip";
import { setSessionCookies, type TokenBundle } from "@/lib/session";

/** Create an account and sign the new user straight in. */
export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
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
    response = await fetch(`${BACKEND_URL}${API_PREFIX}/auth/signup`, {
      method: "POST",
      headers: upstreamHeaders,
      body: JSON.stringify(payload),
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
      body ?? { error: { code: "signup_failed", message: "We could not create that account." } },
      { status: response.status },
    );
  }

  const bundle = body as TokenBundle;
  await setSessionCookies(bundle);
  return NextResponse.json({ user: bundle.user, workspaces: bundle.workspaces }, { status: 201 });
}
