import { NextResponse } from "next/server";

import { backendFetch } from "@/lib/backend";
import { clearSessionCookies } from "@/lib/session";

/**
 * End the session.
 *
 * The cookies are cleared regardless of whether the backend call succeeds:
 * a user who clicks "Sign out" must end up signed out even if the API is down.
 */
export async function POST() {
  try {
    await backendFetch("/auth/logout", { method: "POST" });
  } catch {
    // Intentionally ignored — see above.
  }
  await clearSessionCookies();
  return NextResponse.json({ message: "Signed out." });
}
