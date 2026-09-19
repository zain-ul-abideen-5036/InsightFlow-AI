import { NextResponse } from "next/server";

import { API_PREFIX, BACKEND_URL } from "@/lib/backend";
import { applyClientIdentity } from "@/lib/client-ip";

/** Begin a password reset. Always reports success, to avoid account enumeration. */
export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({}));

  // The rate limit that protects this endpoint is only meaningful if the
  // backend knows who is calling. See lib/client-ip.ts.
  const upstreamHeaders = new Headers({ "Content-Type": "application/json" });
  await applyClientIdentity(upstreamHeaders);

  try {
    const response = await fetch(`${BACKEND_URL}${API_PREFIX}/auth/password-reset`, {
      method: "POST",
      headers: upstreamHeaders,
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    return NextResponse.json(await response.json(), { status: response.status });
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
