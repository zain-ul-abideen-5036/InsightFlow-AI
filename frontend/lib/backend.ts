/**
 * Server-side calls to the FastAPI backend.
 *
 * Every function here runs on the Next.js server, never in the browser. The
 * access token is read from the httpOnly session cookie and attached as a
 * bearer token, and a 401 triggers exactly one transparent refresh attempt
 * before the caller is told the session has ended.
 */

import "server-only";

import { applyClientIdentity } from "@/lib/client-ip";
import {
  getAccessToken,
  getRefreshToken,
  updateAccessToken,
  type TokenBundle,
} from "@/lib/session";

export const BACKEND_URL = (
  process.env.BACKEND_API_URL ?? "http://localhost:8000"
).replace(/\/$/, "");

export const API_PREFIX = "/api/v1";

export interface ApiErrorPayload {
  code: string;
  message: string;
  hint?: string;
  details?: Record<string, unknown>;
  request_id?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly payload: ApiErrorPayload;

  constructor(status: number, payload: ApiErrorPayload) {
    super(payload.message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }

  get hint() {
    return this.payload.hint;
  }

  get code() {
    return this.payload.code;
  }
}

/** A network-level failure, phrased for a user rather than an engineer. */
const UNREACHABLE: ApiErrorPayload = {
  code: "backend_unreachable",
  message: "We could not reach the analysis service.",
  hint: "Check that the backend is running, then try again.",
};

async function parseError(response: Response): Promise<ApiErrorPayload> {
  try {
    const body = await response.json();
    if (body?.error?.message) return body.error as ApiErrorPayload;
    if (typeof body?.detail === "string") {
      return { code: `http_${response.status}`, message: body.detail };
    }
  } catch {
    // Body was not JSON — fall through to a generic message.
  }
  return {
    code: `http_${response.status}`,
    message:
      response.status >= 500
        ? "Something went wrong on our side."
        : "That request could not be completed.",
  };
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: BodyInit | Record<string, unknown> | null;
  /** Set false for public endpoints such as login. */
  auth?: boolean;
  /** Internal: prevents infinite refresh recursion. */
  _retried?: boolean;
}

/**
 * Attempt a token refresh using the stored refresh token.
 * Returns the new access token, or null if the session is truly over.
 */
async function tryRefresh(): Promise<string | null> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return null;

  try {
    const response = await fetch(`${BACKEND_URL}${API_PREFIX}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: "no-store",
    });
    if (!response.ok) return null;

    const bundle = (await response.json()) as TokenBundle;
    await updateAccessToken(bundle.access_token, bundle.expires_in);
    return bundle.access_token;
  } catch {
    return null;
  }
}

export async function backendFetch<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { body, auth = true, _retried = false, headers, ...rest } = options;

  const requestHeaders = new Headers(headers);
  let payload: BodyInit | undefined;

  if (body instanceof FormData || body instanceof Blob || typeof body === "string") {
    payload = body;
  } else if (body != null) {
    requestHeaders.set("Content-Type", "application/json");
    payload = JSON.stringify(body);
  }

  if (auth) {
    const token = await getAccessToken();
    if (token) requestHeaders.set("Authorization", `Bearer ${token}`);
  }

  // Login and signup run through here rather than the proxy, and they are the
  // endpoints whose rate limit matters most, so they need the same honest
  // client identification.
  await applyClientIdentity(requestHeaders);

  let response: Response;
  try {
    response = await fetch(`${BACKEND_URL}${API_PREFIX}${path}`, {
      ...rest,
      headers: requestHeaders,
      body: payload,
      cache: "no-store",
    });
  } catch {
    throw new ApiError(503, UNREACHABLE);
  }

  // One transparent refresh, then give up and let the caller sign the user out.
  if (response.status === 401 && auth && !_retried) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      return backendFetch<T>(path, { ...options, _retried: true });
    }
  }

  if (!response.ok) {
    throw new ApiError(response.status, await parseError(response));
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

/** Fetch that returns null on 401/404 instead of throwing — for optional data. */
export async function backendFetchOptional<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T | null> {
  try {
    return await backendFetch<T>(path, options);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 404)) {
      return null;
    }
    throw error;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** Turn any thrown value into something safe to render. */
export function toDisplayError(error: unknown): { message: string; hint?: string } {
  if (isApiError(error)) {
    return { message: error.payload.message, hint: error.payload.hint };
  }
  if (error instanceof Error) {
    return { message: error.message };
  }
  return { message: "Something unexpected happened." };
}
