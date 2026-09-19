import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { InvestigationView } from "@/features/anomalies/investigation-view";
import { backendFetchOptional } from "@/lib/backend";
import { getActiveWorkspaceId } from "@/lib/session";
import type { Anomaly, Workspace } from "@/types/api";

export const metadata: Metadata = { title: "Investigation" };
export const dynamic = "force-dynamic";

export default async function AnomalyPage({
  params,
}: {
  params: Promise<{ anomalyId: string }>;
}) {
  const { anomalyId } = await params;
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return null;

  const [anomaly, workspace] = await Promise.all([
    backendFetchOptional<Anomaly>(`/workspaces/${workspaceId}/anomalies/${anomalyId}`),
    backendFetchOptional<Workspace>(`/workspaces/${workspaceId}`),
  ]);
  if (!anomaly) notFound();

  return (
    <InvestigationView
      workspaceId={workspaceId}
      anomaly={anomaly}
      currency={workspace?.currency ?? "USD"}
    />
  );
}
