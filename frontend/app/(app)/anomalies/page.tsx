import type { Metadata } from "next";

import { AnomaliesView } from "@/features/anomalies/anomalies-view";
import { backendFetch, backendFetchOptional } from "@/lib/backend";
import { getActiveWorkspaceId } from "@/lib/session";
import type { Anomaly, Page, Workspace } from "@/types/api";

export const metadata: Metadata = {
  title: "Anomalies",
  description: "Periods that fall outside what your data would predict.",
};

export const dynamic = "force-dynamic";

export default async function AnomaliesPage() {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return null;

  const [anomalies, workspace] = await Promise.all([
    backendFetch<Page<Anomaly>>(`/workspaces/${workspaceId}/anomalies?limit=100`),
    backendFetchOptional<Workspace>(`/workspaces/${workspaceId}`),
  ]);

  return (
    <AnomaliesView
      workspaceId={workspaceId}
      initialData={anomalies}
      currency={workspace?.currency ?? "USD"}
    />
  );
}
