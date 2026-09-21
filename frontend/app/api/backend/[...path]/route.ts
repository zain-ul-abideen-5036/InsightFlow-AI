import { NextResponse } from "next/server";

import { API_PREFIX, BACKEND_URL } from "@/lib/backend";
import { applyClientIdentity } from "@/lib/client-ip";
import { isTimeoutError } from "@/lib/fetch-errors";
import { getAccessToken, getRefreshToken, updateAccessToken } from "@/lib/session";
import type { TokenBundle } from "@/lib/session";

/**
 * Authenticating reverse proxy to the FastAPI backend.
 *
 * Every browser request goes through here rather than straight to the API. That
 * buys three things:
 *
 * 1. The session cookie stays first-party to this origin, so it survives Safari's
 *    third-party cookie blocking and needs no `SameSite=None`.
 * 2. Access tokens never enter JavaScript's reach, so an XSS bug cannot steal one.
 * 3. There is no CORS to configure in production.
 *
 * Request bodies are buffered on the way through (see the note below), bounded
 * by the same upload limit the backend enforces.
 */

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

type RouteContext = { params: Promise<{ path: string[] }> };


async function proxy(
  request: Request,
  context: RouteContext,
  retried = false,
  bufferedBody?: ArrayBuffer,
): Promise<Response> {
  const { path } = await context.params;
  const target = `/${(path ?? []).join("/")}`;
  const search = new URL(request.url).search;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) headers.set(key, value);
  });

  const token = await getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  else headers.delete("Authorization");

  // Strip the headers a browser could use to impersonate a proxy, then state
  // the caller's real address ourselves. Without this the backend rate-limits
  // every user of the product against one shared budget, because in production
  // every request reaches it from this server's address.
  await applyClientIdentity(headers);

  // The request body is buffered rather than streamed through. Forwarding
  // `request.body` directly is the obvious implementation and does not work:
  // undici rejects the Route Handler's stream with "expected non-null body
  // source". Buffering is bounded by the same upload limit the backend
  // enforces (MAX_UPLOAD_SIZE_MB), so the memory cost is capped and known.
  const methodAllowsBody = request.method !== "GET" && request.method !== "HEAD";
  const payload = bufferedBody ?? (methodAllowsBody ? await request.arrayBuffer() : undefined);
  const body = payload && payload.byteLength > 0 ? payload : undefined;

  let upstream: Response;
  try {
    upstream = await fetch(`${BACKEND_URL}${API_PREFIX}${target}${search}`, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
      redirect: "manual",
    });
  } catch (error) {
    // Log the underlying cause: without this, every transport-level problem —
    // DNS, TLS, a refused connection, a malformed header — looks identical to
    // "the backend is down" and is undiagnosable from the outside.
    console.error(
      `[proxy] ${request.method} ${target} failed:`,
      error instanceof Error ? `${error.message}${error.cause ? ` (cause: ${String(error.cause)})` : ""}` : error,
    );

    // A backend that answered too slowly is not a backend that is down, and
    // saying so sends the reader to check a service that is running fine.
    // Node stops waiting for response headers after 300s and that ceiling is
    // not reachable from a route handler, so the honest thing is to name what
    // actually happened. The backend's own AI budget is set below this so it
    // times out first and returns its deterministic answer; this branch is
    // the backstop for when something still runs longer.
    if (isTimeoutError(error)) {
      return NextResponse.json(
        {
          error: {
            code: "backend_timeout",
            message: "The analysis service took too long to answer.",
            hint: "It is still running. A slow local AI model is the usual cause — try a shorter question, or point AI_PROVIDER at a hosted model.",
          },
        },
        { status: 504 },
      );
    }

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

  // One transparent refresh. The replay re-reads `request`, whose body has
  // already been consumed above, so the buffered payload is handed down rather
  // than read again.
  if (upstream.status === 401 && !retried) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return proxy(request, context, true, body);
  }

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase()) && key.toLowerCase() !== "content-encoding") {
      responseHeaders.set(key, value);
    }
  });

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return false;
  try {
    const response = await fetch(`${BACKEND_URL}${API_PREFIX}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: "no-store",
    });
    if (!response.ok) return false;
    const bundle = (await response.json()) as TokenBundle;
    await updateAccessToken(bundle.access_token, bundle.expires_in);
    return true;
  } catch {
    return false;
  }
}

export async function GET(request: Request, context: RouteContext) {
  return proxy(request, context);
}
export async function POST(request: Request, context: RouteContext) {
  return proxy(request, context);
}
export async function PATCH(request: Request, context: RouteContext) {
  return proxy(request, context);
}
export async function PUT(request: Request, context: RouteContext) {
  return proxy(request, context);
}
export async function DELETE(request: Request, context: RouteContext) {
  return proxy(request, context);
}
