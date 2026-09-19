import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DatasetDetailView } from "@/features/datasets/dataset-detail-view";
import { backendFetchOptional } from "@/lib/backend";
import { getActiveWorkspaceId } from "@/lib/session";
import type { DatasetDetail } from "@/types/api";

export const metadata: Metadata = { title: "Dataset" };
export const dynamic = "force-dynamic";

export default async function DatasetPage({
  params,
}: {
  params: Promise<{ datasetId: string }>;
}) {
  const { datasetId } = await params;
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return null;

  const dataset = await backendFetchOptional<DatasetDetail>(
    `/workspaces/${workspaceId}/datasets/${datasetId}`,
  );
  if (!dataset) notFound();

  return <DatasetDetailView workspaceId={workspaceId} dataset={dataset} />;
}
