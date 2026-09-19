"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, MoreHorizontal, Plus, Trash2 } from "lucide-react";

import { EmptyState } from "@/components/states/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/toast";
import { api, ClientApiError, queryKeys } from "@/lib/api-client";
import { formatRelativeTime } from "@/lib/utils";
import type { Page, Report } from "@/types/api";

export function ReportsList({
  workspaceId,
  initialData,
  canGenerate,
}: {
  workspaceId: string;
  initialData: Page<Report>;
  canGenerate: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data } = useQuery({
    queryKey: queryKeys.reports(workspaceId),
    queryFn: () => api.reports(workspaceId),
    initialData,
  });

  const generate = useMutation({
    mutationFn: () => api.createReport(workspaceId, {}),
    onSuccess: (report) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.reports(workspaceId) });
      router.push(`/reports/${report.id}`);
    },
    onError: (error: ClientApiError) => {
      toast({
        title: "Could not generate the report",
        description: error.payload.hint ?? error.message,
        tone: "error",
      });
    },
  });

  const remove = useMutation({
    mutationFn: (reportId: string) => api.deleteReport(workspaceId, reportId),
    onSuccess: () => {
      toast({ title: "Report deleted", tone: "success" });
      queryClient.invalidateQueries({ queryKey: queryKeys.reports(workspaceId) });
    },
  });

  const reports = data?.items ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
          <p className="text-md text-muted-foreground">
            A shareable summary of how the business performed, with the figures behind it.
          </p>
        </div>
        {canGenerate ? (
          <Button
            loading={generate.isPending}
            loadingText="Generating…"
            onClick={() => generate.mutate()}
          >
            <Plus aria-hidden="true" />
            Generate report
          </Button>
        ) : null}
      </header>

      {reports.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No reports yet"
          description="A report pulls together the executive summary, key figures, trends, insights, and anomalies from an analysis into one page you can print or hand to someone else. Figures are captured at the moment you generate it, so a report never changes under you."
          action={
            canGenerate ? (
              <Button
                loading={generate.isPending}
                loadingText="Generating…"
                onClick={() => generate.mutate()}
              >
                <Plus aria-hidden="true" />
                Generate your first report
              </Button>
            ) : (
              <Button asChild>
                <Link href="/datasets/new">Upload data first</Link>
              </Button>
            )
          }
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {reports.map((report) => (
            <li
              key={report.id}
              className="group flex items-start gap-3 rounded-lg border border-border bg-card p-4 transition-shadow hover:shadow-md"
            >
              <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <FileText className="size-4" aria-hidden="true" />
              </div>

              <div className="min-w-0 flex-1 space-y-1">
                <Link
                  href={`/reports/${report.id}`}
                  className="block text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {report.title}
                </Link>
                <p className="text-xs text-muted-foreground">{report.period_label}</p>
                <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                  {report.executive_summary}
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <Badge variant="neutral">
                    {report.generated_by === "deterministic" ? "Computed" : report.generated_by}
                  </Badge>
                  <span className="text-2xs text-muted-foreground">
                    {formatRelativeTime(report.created_at)}
                  </span>
                </div>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Actions for ${report.title}`}
                  >
                    <MoreHorizontal aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link href={`/reports/${report.id}`}>Open</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem destructive onClick={() => remove.mutate(report.id)}>
                    <Trash2 aria-hidden="true" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
