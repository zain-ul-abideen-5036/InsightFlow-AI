import type { Metadata } from "next";

import { OverviewDashboard } from "@/features/dashboard/overview-dashboard";
import { backendFetch } from "@/lib/backend";
import { getActiveWorkspaceId } from "@/lib/session";
import type { Overview } from "@/types/api";

export const metadata: Metadata = {
  title: "Overview",
  description: "How your business is performing.",
};

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) {
    // The layout guarantees a workspace exists; this is a defensive fallback.
    return null;
  }

  const overview = await backendFetch<Overview>(`/workspaces/${workspaceId}/overview`);

  return <OverviewDashboard workspaceId={workspaceId} initialData={overview} />;
}
