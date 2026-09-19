import { NextResponse } from "next/server";

import { API_PREFIX, BACKEND_URL } from "@/lib/backend";
import { applyClientIdentity } from "@/lib/client-ip";
import { setSessionCookies, type TokenBundle } from "@/lib/session";

/**
 * Open a demo workspace and sign the visitor into it.
 *
 * POST rather than GET, and a route handler rather than a link, so that a
 * crawler, a link preview, or a browser prefetch cannot silently create
 * workspaces. The backend rate-limits this the same way it rate-limits signup.
 */
export async function POST() {
  const headers = new Headers({ "Content-Type": "application/json" });
  await applyClientIdentity(headers);

  let response: Response;
  try {
    response = await fetch(`${BACKEND_URL}${API_PREFIX}/auth/demo`, {
      method: "POST",
      headers,
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "backend_unreachable",
          message: "We could not reach the analysis service.",
          hint: "The demo needs the analysis service to be running. Try again in a moment.",
        },
      },
      { status: 503 },
    );
  }

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    return NextResponse.json(
      body ?? {
        error: {
          code: "demo_failed",
          message: "We could not start the demo.",
          hint: "Create an account instead — it takes about thirty seconds.",
        },
      },
      { status: response.status },
    );
  }

  const bundle = body as TokenBundle;
  await setSessionCookies(bundle);

  return NextResponse.json(
    { user: bundle.user, workspaces: bundle.workspaces },
    { status: 201 },
  );
}
