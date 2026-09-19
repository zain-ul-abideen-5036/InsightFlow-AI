import type { Metadata } from "next";

import { ReportsList } from "@/features/reports/reports-list";
import { backendFetch, backendFetchOptional } from "@/lib/backend";
import { getActiveWorkspaceId } from "@/lib/session";
import type { Analysis, Page, Report } from "@/types/api";

export const metadata: Metadata = {
  title: "Reports",
  description: "Shareable business performance reports.",
};

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return null;

  const [reports, analyses] = await Promise.all([
    backendFetch<Page<Report>>(`/workspaces/${workspaceId}/reports`),
    backendFetchOptional<Page<Analysis>>(`/workspaces/${workspaceId}/analyses`),
  ]);

  // A report can only be built from a completed analysis; offering the button
  // otherwise would produce an error the user cannot act on.
  const canGenerate = Boolean(
    analyses?.items.some((analysis) => analysis.status === "completed"),
  );

  return (
    <ReportsList workspaceId={workspaceId} initialData={reports} canGenerate={canGenerate} />
  );
}
