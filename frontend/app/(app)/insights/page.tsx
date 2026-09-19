import type { Metadata } from "next";

import { InsightsView } from "@/features/insights/insights-view";
import { backendFetch, backendFetchOptional } from "@/lib/backend";
import { getActiveWorkspaceId } from "@/lib/session";
import type { Insight, Page, Workspace } from "@/types/api";

export const metadata: Metadata = {
  title: "Insights",
  description: "What changed in your business, ranked by how much it matters.",
};

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return null;

  const [insights, workspace] = await Promise.all([
    backendFetch<Page<Insight>>(`/workspaces/${workspaceId}/insights?limit=100`),
    backendFetchOptional<Workspace>(`/workspaces/${workspaceId}`),
  ]);

  return (
    <InsightsView
      workspaceId={workspaceId}
      initialData={insights}
      currency={workspace?.currency ?? "USD"}
    />
  );
}
