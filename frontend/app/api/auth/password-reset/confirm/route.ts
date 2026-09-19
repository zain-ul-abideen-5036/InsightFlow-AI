import { NextResponse } from "next/server";

import { API_PREFIX, BACKEND_URL } from "@/lib/backend";
import { applyClientIdentity } from "@/lib/client-ip";
import { clearSessionCookies } from "@/lib/session";

/** Complete a password reset and retire any existing session. */
export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({}));

  // The rate limit that protects this endpoint is only meaningful if the
  // backend knows who is calling. See lib/client-ip.ts.
  const upstreamHeaders = new Headers({ "Content-Type": "application/json" });
  await applyClientIdentity(upstreamHeaders);

  try {
    const response = await fetch(`${BACKEND_URL}${API_PREFIX}/auth/password-reset/confirm`, {
      method: "POST",
      headers: upstreamHeaders,
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const body = await response.json();
    if (response.ok) {
      // The backend invalidates prior tokens; clear the stale cookies too.
      await clearSessionCookies();
    }
    return NextResponse.json(body, { status: response.status });
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "backend_unreachable",
          message: "We could not reach the analysis service.",
        },
      },
      { status: 503 },
    );
  }
}
