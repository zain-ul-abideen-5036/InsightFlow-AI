"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";

import { ErrorState } from "@/components/states/error-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { AnalysisProgress } from "@/features/analysis/analysis-progress";
import { DatasetPreview } from "@/features/datasets/dataset-preview";
import { FieldReview, type FieldSelection } from "@/features/datasets/field-review";
import { UploadDropzone } from "@/features/datasets/upload-dropzone";
import { api, ClientApiError, queryKeys } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { DatasetDetail, Grain } from "@/types/api";

type Step = "upload" | "preview" | "review" | "analysing";

const STEPS: { key: Step; label: string }[] = [
  { key: "upload", label: "Upload" },
  { key: "preview", label: "Preview" },
  { key: "review", label: "Review fields" },
  { key: "analysing", label: "Analyse" },
];

/**
 * The upload-to-insight workflow.
 *
 * Deliberately staged: preview before review, review before analysis. The
 * review step is the one that cannot be skipped, because every downstream
 * figure depends on the field meanings being right.
 */
export function DatasetWorkflow({
  workspaceId,
  dataset: initialDataset,
  demoEnabled = true,
}: {
  workspaceId: string;
  dataset?: DatasetDetail;
  demoEnabled?: boolean;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [dataset, setDataset] = React.useState<DatasetDetail | null>(initialDataset ?? null);
  const [analysisId, setAnalysisId] = React.useState<string | null>(null);
  const [step, setStep] = React.useState<Step>(initialDataset ? "preview" : "upload");

  const upload = useMutation({
    mutationFn: (file: File) => api.uploadDataset(workspaceId, file),
    onSuccess: (result) => {
      setDataset(result);
      setStep("preview");
      queryClient.invalidateQueries({ queryKey: queryKeys.datasets(workspaceId) });
    },
  });

  const loadDemo = useMutation({
    mutationFn: () => api.loadDemoDataset(workspaceId),
    onSuccess: (result) => {
      setDataset(result);
      setStep("preview");
      queryClient.invalidateQueries({ queryKey: queryKeys.datasets(workspaceId) });
    },
    onError: (error: ClientApiError) => {
      toast({ title: "Could not load the sample", description: error.message, tone: "error" });
    },
  });

  const fields = useQuery({
    queryKey: queryKeys.fields(workspaceId, dataset?.id ?? ""),
    queryFn: () => api.datasetFields(workspaceId, dataset!.id),
    enabled: Boolean(dataset?.id) && step === "review",
  });

  const confirm = useMutation({
    mutationFn: ({ columns, grain }: { columns: FieldSelection[]; grain: Grain | null }) =>
      api.confirmSchema(workspaceId, dataset!.id, {
        columns,
        grain,
        start_analysis: true,
      }),
    onSuccess: (result) => {
      if (result.analysis) {
        setAnalysisId(result.analysis.id);
        setStep("analysing");
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.datasets(workspaceId) });
    },
    onError: (error: ClientApiError) => {
      toast({ title: "Could not start the analysis", description: error.message, tone: "error" });
    },
  });

  const activeIndex = STEPS.findIndex((item) => item.key === step);

  return (
    <div className="space-y-6">
      <Stepper activeIndex={activeIndex} />

      {step === "upload" ? (
        <div className="space-y-4">
          <UploadDropzone
            onUpload={(file) => upload.mutate(file)}
            uploading={upload.isPending}
            error={upload.error as ClientApiError | null}
          />

          {demoEnabled ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3.5">
              <div className="min-w-0">
                <p className="text-sm font-medium">No data to hand?</p>
                <p className="text-xs text-muted-foreground">
                  Load NovaMart — 14,000 orders across 15 months, with a real story in it.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                loading={loadDemo.isPending}
                loadingText="Loading…"
                onClick={() => loadDemo.mutate()}
              >
                <Sparkles aria-hidden="true" />
                Use sample data
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {step === "preview" && dataset ? (
        <div className="space-y-4">
          <DatasetPreview dataset={dataset} />
          <div className="flex justify-end">
            <Button onClick={() => setStep("review")}>
              Review detected fields
              <ArrowRight aria-hidden="true" />
            </Button>
          </div>
        </div>
      ) : null}

      {step === "review" && dataset ? (
        <>
          {fields.isLoading ? (
            <div className="space-y-3" aria-busy="true">
              <div className="shimmer h-10 w-full rounded-md" />
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
        </>
      ) : null}

      {step === "analysing" && analysisId ? (
        <div className="space-y-4">
          <AnalysisProgress
            workspaceId={workspaceId}
            analysisId={analysisId}
            onComplete={() => {
              queryClient.invalidateQueries({ queryKey: queryKeys.overview(workspaceId) });
              toast({
                title: "Analysis complete",
                description: "Your dashboard is ready.",
                tone: "success",
              });
            }}
          />
          <CompletionActions workspaceId={workspaceId} analysisId={analysisId} />
        </div>
      ) : null}
    </div>
  );
}

function CompletionActions({
  workspaceId,
  analysisId,
}: {
  workspaceId: string;
  analysisId: string;
}) {
  const { data } = useQuery({
    queryKey: queryKeys.analysis(workspaceId, analysisId),
    queryFn: () => api.analysis(workspaceId, analysisId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "queued" || status === "running" ? 1500 : false;
    },
  });

  if (data?.status !== "completed") return null;

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
        <CardTitle className="text-sm">Ready to explore</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button asChild>
          <a href="/overview">
            View dashboard
            <ArrowRight aria-hidden="true" />
          </a>
        </Button>
        <Button variant="outline" asChild>
          <a href="/insights">See all insights</a>
        </Button>
        <Button variant="outline" asChild>
          <a href="/ask">Ask a question</a>
        </Button>
      </CardContent>
    </Card>
  );
}

function Stepper({ activeIndex }: { activeIndex: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-2" aria-label="Upload progress">
      {STEPS.map((item, index) => {
        const state = index < activeIndex ? "done" : index === activeIndex ? "current" : "todo";
        return (
          <li key={item.key} className="flex items-center gap-2">
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full text-2xs font-semibold",
                state === "done" && "bg-success text-success-foreground",
                state === "current" && "bg-primary text-primary-foreground",
                state === "todo" && "bg-muted text-muted-foreground",
              )}
              aria-hidden="true"
            >
              {state === "done" ? <CheckCircle2 className="size-3.5" /> : index + 1}
            </span>
            <span
              className={cn(
                "text-sm",
                state === "current" ? "font-medium text-foreground" : "text-muted-foreground",
              )}
              aria-current={state === "current" ? "step" : undefined}
            >
              {item.label}
            </span>
            {index < STEPS.length - 1 ? (
              <span className="mx-1 hidden h-px w-6 bg-border sm:block" aria-hidden="true" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
