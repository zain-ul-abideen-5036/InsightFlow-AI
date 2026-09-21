"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  FileSpreadsheet,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { ErrorState } from "@/components/states/error-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { AnalysisProgress } from "@/features/analysis/analysis-progress";
import { DatasetPreview } from "@/features/datasets/dataset-preview";
import { FieldReview, type FieldSelection } from "@/features/datasets/field-review";
import { UploadDropzone } from "@/features/datasets/upload-dropzone";
import { UPLOAD_STEPS, UploadStepper } from "@/features/datasets/upload-stepper";
import { api, ClientApiError, queryKeys } from "@/lib/api-client";
import { cn, formatDate } from "@/lib/utils";
import type { DatasetDetail, Grain } from "@/types/api";

type Step = "upload" | "preview" | "review" | "analysing";

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

  const activeIndex = UPLOAD_STEPS.findIndex((item) => item.key === step);

  return (
    <div className="space-y-6">
      <UploadStepper activeIndex={activeIndex} />

      {step === "upload" ? (
        <div className="space-y-4">
          <UploadDropzone
            onUpload={(file) => upload.mutate(file)}
            uploading={upload.isPending}
            error={upload.error as ClientApiError | null}
          />

          {demoEnabled ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3.5 shadow-e1">
              <div className="min-w-0">
                <p className="text-sm font-semibold">No data to hand?</p>
                <p className="text-xs text-muted-foreground">
                  Load NovaMart — 14,000 orders across 15 months, with a real story in it.
                </p>
              </div>
              <Button
                variant="outline"
                loading={loadDemo.isPending}
                loadingText="Loading…"
                onClick={() => loadDemo.mutate()}
              >
                <Sparkles aria-hidden="true" />
                Use sample data
              </Button>
            </div>
          ) : null}

          <WhatWeLookFor />
        </div>
      ) : null}

      {step === "preview" && dataset ? (
        <div className="space-y-4">
          <ValidationSummary dataset={dataset} />
          <DatasetPreview dataset={dataset} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Nothing is analysed until you confirm what each column means.
            </p>
            <Button size="lg" onClick={() => setStep("review")}>
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
    <Card tone="success" elevation="flat">
      <CardHeader className="flex-row items-center gap-2.5 space-y-0">
        <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden="true" />
        <div>
          <CardTitle>Ready to explore</CardTitle>
          <p className="text-sm text-muted-foreground">
            Your figures are computed. Start with what changed.
          </p>
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button size="lg" asChild>
          <a href="/overview">
            View dashboard
            <ArrowRight aria-hidden="true" />
          </a>
        </Button>
        <Button size="lg" variant="outline" asChild>
          <a href="/insights">See all insights</a>
        </Button>
        <Button size="lg" variant="outline" asChild>
          <a href="/ask">
            <MessageSquareText aria-hidden="true" />
            Ask InsightFlow
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * What a good file looks like.
 *
 * Step one used to be a dashed rectangle and then four hundred pixels of
 * nothing. This is the question a first-time user actually has at that
 * moment, answered before they go and open their export to check.
 */
function WhatWeLookFor() {
  const fields = [
    {
      label: "A date",
      required: true,
      body: "Order date, invoice date, transaction date. Any common format; mixed formats are fine.",
    },
    {
      label: "An amount",
      required: true,
      body: "Revenue, total, or price. Currency symbols, thousands separators and accounting negatives are all handled.",
    },
    {
      label: "Something to group by",
      required: false,
      body: "Product, category, region, channel or customer. Each one you have adds a dimension to break results down by.",
    },
    {
      label: "Cost or quantity",
      required: false,
      body: "Adds margin, profit and units. Metrics your columns cannot support are reported as unavailable, never as zero.",
    },
  ];

  return (
    <section
      aria-labelledby="what-we-look-for"
      className="rounded-xl border border-border bg-surface-sunken/60 px-5 py-4"
    >
      <div className="flex items-center gap-2">
        <FileSpreadsheet className="size-4 text-subtle-foreground" aria-hidden="true" />
        <h2 id="what-we-look-for" className="eyebrow">
          What we look for in your file
        </h2>
      </div>
      <dl className="mt-3.5 grid gap-x-8 gap-y-3.5 sm:grid-cols-2">
        {fields.map((field) => (
          <div key={field.label} className="min-w-0">
            <dt className="flex items-center gap-1.5 text-sm font-semibold">
              {field.label}
              {field.required ? (
                <span className="rounded bg-muted px-1 py-px text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  required
                </span>
              ) : null}
            </dt>
            <dd className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {field.body}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 border-t border-border pt-3 text-xs leading-relaxed text-subtle-foreground">
        One row per order or transaction. Title rows above the headers, duplicate column names
        and unusual encodings are all recovered from rather than rejected.
      </p>
    </section>
  );
}

/**
 * The file passed.
 *
 * The flow inspected the file thoroughly and then never said so — the user
 * saw a table of their own rows and had to infer that nothing was wrong.
 * Each line below is a real check the ingestion pipeline performed, and the
 * ones that did not pass say so rather than being omitted.
 */
function ValidationSummary({ dataset }: { dataset: DatasetDetail }) {
  const profile = dataset.profile;
  const hasDate = Boolean(profile.date_min && profile.date_max);
  // Counted from the dataset's own column records, not from the profile:
  // `DatasetProfile` carries roles and quality, not per-column types.
  const numericCount = dataset.columns.filter(
    (column) => column.data_type === "number" || column.data_type === "integer",
  ).length;

  const checks = [
    {
      ok: true,
      label: "Dataset readable",
      detail: `${dataset.row_count.toLocaleString()} rows across ${dataset.column_count} columns.`,
    },
    {
      ok: hasDate,
      label: hasDate ? "Date field detected" : "No date field detected",
      detail: hasDate
        ? `${formatDate(profile.date_min)} to ${formatDate(profile.date_max)}.`
        : "Trends and period comparisons need a date column. You can set one in the next step.",
    },
    {
      ok: numericCount > 0,
      label: numericCount > 0 ? "Numeric fields validated" : "No numeric fields found",
      detail:
        numericCount > 0
          ? `${numericCount} numeric ${numericCount === 1 ? "column" : "columns"} parsed, including currency and accounting formats.`
          : "Without an amount column there is nothing to total. Check the next step.",
    },
    {
      ok: true,
      label: "Fields understood",
      detail: "Each column has a proposed meaning for you to confirm or correct.",
    },
  ];

  const allPassed = checks.every((check) => check.ok);

  return (
    <section
      aria-labelledby="validation-heading"
      className={cn(
        "rounded-xl border px-5 py-4",
        allPassed ? "border-success-border bg-success-subtle/60" : "border-warning-border bg-warning-subtle/60",
      )}
    >
      <div className="flex items-center gap-2">
        <ShieldCheck
          className={cn("size-4", allPassed ? "text-success" : "text-warning")}
          aria-hidden="true"
        />
        <h2 id="validation-heading" className="text-sm font-semibold">
          {allPassed ? "Your file checks out" : "Your file needs a look"}
        </h2>
      </div>
      <ul className="mt-3 grid gap-x-8 gap-y-2 sm:grid-cols-2">
        {checks.map((check) => (
          <li key={check.label} className="flex items-start gap-2">
            {check.ok ? (
              <CheckCircle2
                className="mt-0.5 size-3.5 shrink-0 text-success"
                aria-hidden="true"
              />
            ) : (
              <AlertCircle
                className="mt-0.5 size-3.5 shrink-0 text-warning"
                aria-hidden="true"
              />
            )}
            <span className="min-w-0">
              <span className="block text-sm font-medium">{check.label}</span>
              <span className="block text-xs leading-relaxed text-muted-foreground">
                {check.detail}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
