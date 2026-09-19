import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SettingsView } from "@/features/settings/settings-view";
import { backendFetch, backendFetchOptional } from "@/lib/backend";
import { getActiveWorkspaceId } from "@/lib/session";
import type { AIStatus, SessionResponse, Workspace } from "@/types/api";

export const metadata: Metadata = {
  title: "Settings",
  description: "Workspace, profile, and AI configuration.",
};

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) redirect("/onboarding");

  const [session, workspace, aiStatus] = await Promise.all([
    backendFetch<SessionResponse>("/auth/session"),
    backendFetch<Workspace>(`/workspaces/${workspaceId}`),
    // The AI provider may be unreachable; that is information, not a failure.
    backendFetchOptional<AIStatus>("/ai/status"),
  ]);

  return <SettingsView workspace={workspace} user={session.user} aiStatus={aiStatus} />;
}
