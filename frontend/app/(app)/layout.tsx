import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { backendFetch, isApiError } from "@/lib/backend";
import { getActiveWorkspaceId, setActiveWorkspaceId } from "@/lib/session";
import type { SessionResponse } from "@/types/api";

/**
 * The authenticated shell.
 *
 * The session is resolved on the server so the first paint already knows who
 * the user is and which workspace is active — no loading flash, and no chance
 * of briefly rendering another tenant's chrome.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let session: SessionResponse;

  try {
    session = await backendFetch<SessionResponse>("/auth/session");
  } catch (error) {
    if (isApiError(error) && error.status === 401) {
      redirect("/login");
    }
    // The backend being unreachable is not an auth failure; let the error
    // boundary explain it rather than bouncing the user to a login page that
    // will not work either.
    throw error;
  }

  if (session.workspaces.length === 0) {
    redirect("/onboarding");
  }

  const activeId = await getActiveWorkspaceId();
  const workspace =
    session.workspaces.find((item) => item.id === activeId) ?? session.workspaces[0]!;

  // Keep the cookie honest if it pointed at a workspace the user has left.
  if (workspace.id !== activeId) {
    await setActiveWorkspaceId(workspace.id);
  }

  return (
    <AppShell user={session.user} workspace={workspace}>
      {children}
    </AppShell>
  );
}
