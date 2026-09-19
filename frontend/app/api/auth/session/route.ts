import { NextResponse } from "next/server";

import { backendFetch, isApiError } from "@/lib/backend";
import type { SessionResponse } from "@/types/api";

/** The current user and their workspaces, or 401 when signed out. */
export async function GET() {
  try {
    const session = await backendFetch<SessionResponse>("/auth/session");
    return NextResponse.json(session);
  } catch (error) {
    if (isApiError(error)) {
      return NextResponse.json({ error: error.payload }, { status: error.status });
    }
    return NextResponse.json(
      { error: { code: "unknown", message: "We could not load your session." } },
      { status: 500 },
    );
  }
}
