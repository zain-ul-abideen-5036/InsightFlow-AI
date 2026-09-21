"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Play, RefreshCw } from "lucide-react";

import { ErrorState } from "@/components/states/error-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { AnalysisProgress } from "@/features/analysis/analysis-progress";
import { DatasetPreview } from "@/features/datasets/dataset-preview";
import { FieldReview, type FieldSelection } from "@/features/datasets/field-review";
import { api, ClientApiError, queryKeys } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";
import type { DatasetDetail, Grain } from "@/types/api";

/**
 * A single dataset: preview, field review, and analysis.
 *
 * Datasets awaiting review open on the review tab, because that is the action
 * blocking the user from any result.
 */
export function DatasetDetailView({
  workspaceId,
  dataset,
}: {
  workspaceId: string;
  dataset: DatasetDetail;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [analysisId, setAnalysisId] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState(dataset.status === "confirmed" ? "preview" : "fields");

  const fields = useQuery({
    queryKey: queryKeys.fields(workspaceId, dataset.id),
    queryFn: () => api.datasetFields(workspaceId, dataset.id),
    enabled: tab === "fields",
  });

  /**
   * Ask the backend to run a queued analysis. See `api.runAnalysis` for why
   * every deployment gets this call and why calling it twice is harmless.
   */
  const runAnalysis = React.useCallback(
    (id: string) => {
      void api.runAnalysis(workspaceId, id).catch(() => {
        // Reported by the progress poll, which knows why.
      });
    },
    [workspaceId],
  );

  const confirm = useMutation({
    mutationFn: ({ columns, grain }: { columns: FieldSelection[]; grain: Grain | null }) =>
      api.confirmSchema(workspaceId, dataset.id, { columns, grain, start_analysis: true }),
    onSuccess: (result) => {
      if (result.analysis) {
        setAnalysisId(result.analysis.id);
        setTab("analysis");
        runAnalysis(result.analysis.id);
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.datasets(workspaceId) });
    },
    onError: (error: ClientApiError) => {
      toast({ title: "Could not start the analysis", description: error.message, tone: "error" });
    },
  });

  const reanalyse = useMutation({
    mutationFn: () => api.startAnalysis(workspaceId, dataset.id),
    onSuccess: (analysis) => {
      setAnalysisId(analysis.id);
      setTab("analysis");
      runAnalysis(analysis.id);
    },
    onError: (error: ClientApiError) => {
      // A 409 means one is already running — point at it rather than erroring.
      const existing = error.payload.details?.analysis_id as string | undefined;
      if (existing) {
        setAnalysisId(existing);
        setTab("analysis");
        return;
      }
      toast({ title: "Could not start the analysis", description: error.message, tone: "error" });
    },
  });

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/datasets">
            <ArrowLeft aria-hidden="true" />
            All datasets
          </Link>
        </Button>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{dataset.name}</h1>
              {dataset.is_demo ? <Badge variant="info">Sample data</Badge> : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {dataset.row_count.toLocaleString()} rows · {dataset.column_count} columns ·
              uploaded {formatDate(dataset.created_at)}
            </p>
          </div>

          <Button
            variant="outline"
            loading={reanalyse.isPending}
            loadingText="Starting…"
            onClick={() => reanalyse.mutate()}
          >
            {dataset.status === "confirmed" ? (
              <>
                <RefreshCw aria-hidden="true" />
                Re-run analysis
              </>
            ) : (
              <>
                <Play aria-hidden="true" />
                Run analysis
              </>
            )}
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="fields">Detected fields</TabsTrigger>
          <TabsTrigger value="analysis" disabled={!analysisId}>
            Analysis
          </TabsTrigger>
        </TabsList>

        <TabsContent value="preview">
          <DatasetPreview dataset={dataset} />
        </TabsContent>

        <TabsContent value="fields">
          {fields.isLoading ? (
            <div className="space-y-3" aria-busy="true">
              <div className="shimmer h-64 w-full rounded-lg" />
            </div>
          ) : fields.error ? (
            <ErrorState
              message="We could not load the detected fields."
              onRetry={() => fields.refetch()}
            />
          ) : fields.data ? (
            <FieldReview
              fields={fields.data}
              confirming={confirm.isPending}
              onConfirm={(columns, grain) => confirm.mutate({ columns, grain })}
            />
          ) : null}
        </TabsContent>

        <TabsContent value="analysis">
          {analysisId ? (
            <AnalysisProgress
              workspaceId={workspaceId}
              analysisId={analysisId}
              onComplete={() => {
                queryClient.invalidateQueries({ queryKey: queryKeys.overview(workspaceId) });
                toast({
                  title: "Analysis complete",
                  description: "Your dashboard has been updated.",
                  tone: "success",
                });
              }}
            />
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
