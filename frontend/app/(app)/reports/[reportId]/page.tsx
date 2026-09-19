import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ReportView } from "@/features/reports/report-view";
import { backendFetchOptional } from "@/lib/backend";
import { getActiveWorkspaceId } from "@/lib/session";
import type { ReportDetail, Workspace } from "@/types/api";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ reportId: string }>;
}): Promise<Metadata> {
  const { reportId } = await params;
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { title: "Report" };

  const report = await backendFetchOptional<ReportDetail>(
    `/workspaces/${workspaceId}/reports/${reportId}`,
  );
  return { title: report?.title ?? "Report" };
}

export default async function ReportPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const { reportId } = await params;
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return null;

  const [report, workspace] = await Promise.all([
    backendFetchOptional<ReportDetail>(`/workspaces/${workspaceId}/reports/${reportId}`),
    backendFetchOptional<Workspace>(`/workspaces/${workspaceId}`),
  ]);
  if (!report) notFound();

  return <ReportView report={report} currency={workspace?.currency ?? "USD"} />;
}
