import type { Metadata } from "next";

import { DatasetList } from "@/features/datasets/dataset-list";
import { backendFetch } from "@/lib/backend";
import { getActiveWorkspaceId } from "@/lib/session";
import type { Dataset, Page } from "@/types/api";

export const metadata: Metadata = {
  title: "Datasets",
  description: "The business data you have uploaded.",
};

export const dynamic = "force-dynamic";

export default async function DatasetsPage() {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return null;

  const datasets = await backendFetch<Page<Dataset>>(`/workspaces/${workspaceId}/datasets`);

  return <DatasetList workspaceId={workspaceId} initialData={datasets} />;
}
