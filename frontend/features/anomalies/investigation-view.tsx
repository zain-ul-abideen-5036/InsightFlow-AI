"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  Info,
  ListChecks,
  Loader2,
  MapPin,
  Search,
  Sparkles,
} from "lucide-react";

import { ErrorState } from "@/components/states/error-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EvidenceList } from "@/features/insights/evidence-panel";
import { AnomalyRow } from "@/features/anomalies/anomaly-row";
import { api, ClientApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { Anomaly, Confidence, Finding, InvestigationResponse } from "@/types/api";

const CONFIDENCE_VARIANT: Record<Confidence, "success" | "warning" | "neutral"> = {
  high: "success",
  moderate: "warning",
  low: "neutral",
};

/**
 * The investigation of a single anomaly.
 *
 * Structured as: what happened → where it happened → supporting signals →
 * possible explanations → what to check. The explanations are visually set
 * apart from the observations, because the difference between "this is what the
 * data shows" and "this might be why" is the single most important distinction
 * in the product.
 */
export function InvestigationView({
  workspaceId,
  anomaly,
  currency,
}: {
  workspaceId: string;
  anomaly: Anomaly;
  currency: string;
}) {
  const [result, setResult] = React.useState<InvestigationResponse | null>(null);
  const [narrating, setNarrating] = React.useState(false);

  // Phase two: ask for the prose. Deliberately separate from the evidence
  // request, and deliberately failure-tolerant — if the model is slow, down, or
  // rejected by the guardrails, the page keeps the deterministic narrative it
  // is already showing and simply stops waiting.
  const narrate = React.useCallback(() => {
    setNarrating(true);
    api
      .investigate(workspaceId, anomaly.id, { narrate: true })
      .then(setResult)
      .catch(() => undefined)
      .finally(() => setNarrating(false));
  }, [workspaceId, anomaly.id]);

  const investigate = useMutation({
    mutationFn: (refresh: boolean) =>
      api.investigate(workspaceId, anomaly.id, { refresh, narrate: false }),
    onSuccess: (data) => {
      setResult(data);
      if (data.narrative_pending) narrate();
    },
  });

  // Investigating is the whole point of this page, so it starts on arrival.
  const startedRef = React.useRef(false);
  React.useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      investigate.mutate(false);
    }
  }, [investigate]);

  const error = investigate.error as ClientApiError | null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-3">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/anomalies">
            <ArrowLeft aria-hidden="true" />
            All anomalies
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Investigation</h1>
      </div>

      <Card>
        <CardContent className="pt-2">
          <AnomalyRow anomaly={anomaly} currency={currency} showAction={false} />
        </CardContent>
      </Card>

      {investigate.isPending ? (
        <div
          className="flex items-center gap-3 rounded-lg border border-border bg-card px-5 py-4"
          role="status"
        >
          <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium">Investigating this period</p>
            <p className="text-xs text-muted-foreground">
              Comparing it against the surrounding periods, attributing the movement across
              every segment, and looking for anything that coincided with it.
            </p>
          </div>
        </div>
      ) : null}

      {error ? (
        <ErrorState
          message={error.payload.message}
          hint={error.payload.hint}
          onRetry={() => investigate.mutate(false)}
        />
      ) : null}

      {result ? (
        <InvestigationBody result={result} currency={currency} narrating={narrating} />
      ) : null}
    </div>
  );
}

function InvestigationBody({
  result,
  currency,
  narrating,
}: {
  result: InvestigationResponse;
  currency: string;
  narrating: boolean;
}) {
  const { investigation, narrative } = result;

  // When no model has written the narrative, its prose *is* the findings,
  // joined together — the engine builds it that way. Rendering both puts every
  // sentence on the page twice, which reads as a rendering fault rather than as
  // an answer. The findings are the better of the two: they keep their
  // structure and each one carries its own evidence.
  const showNarrativeProse = !result.is_fallback;
  const allEvidence = React.useMemo(
    () =>
      [
        ...investigation.what_happened,
        ...investigation.where_it_happened,
        ...investigation.supporting_evidence,
      ].flatMap((finding) => finding.evidence),
    [investigation],
  );

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-lg">
            {narrative.headline || investigation.headline}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <Section title="What happened" icon={Info}>
            {showNarrativeProse && narrative.what_happened ? (
              <p className="text-sm leading-relaxed">{narrative.what_happened}</p>
            ) : null}
            <FindingList findings={investigation.what_happened} />
          </Section>

          {investigation.where_it_happened.length ? (
            <Section title="Where it happened" icon={MapPin}>
              {showNarrativeProse && narrative.where_it_happened ? (
                <p className="text-sm leading-relaxed">{narrative.where_it_happened}</p>
              ) : null}
              <FindingList findings={investigation.where_it_happened} />
            </Section>
          ) : null}

          {investigation.supporting_evidence.length ? (
            <Section title="Supporting signals" icon={Search}>
              <FindingList findings={investigation.supporting_evidence} />
            </Section>
          ) : null}

          {investigation.possible_explanations.length ? (
            <section className="space-y-2 rounded-md border border-border bg-surface px-4 py-3.5">
              <h3 className="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                <Sparkles className="size-3" aria-hidden="true" />
                Possible explanations
              </h3>
              {/* Hypotheses, not findings. The surface change and the muted text
                  are doing real work here: they signal a different kind of claim. */}
              <ul className="space-y-2">
                {investigation.possible_explanations.map((finding, index) => (
                  <li key={index} className="text-sm leading-relaxed text-muted-foreground">
                    {finding.statement}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {investigation.recommended_checks.length ? (
            <Section title="What to check next" icon={ListChecks}>
              <ul className="space-y-1.5">
                {investigation.recommended_checks.map((check, index) => (
                  <li key={index} className="flex gap-2 text-sm leading-relaxed">
                    <span className="text-muted-foreground" aria-hidden="true">
                      →
                    </span>
                    <span>{check}</span>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          <footer className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
            <Badge variant={CONFIDENCE_VARIANT[investigation.confidence]}>
              Confidence: {investigation.confidence}
            </Badge>
            {investigation.explained_pct !== null ? (
              <Badge variant="neutral">
                {investigation.explained_pct.toFixed(0)}% attributed to one segment
              </Badge>
            ) : null}
            {/* The findings above are already final — they came from the
                engine. This only says whether a model has finished rephrasing
                them, so it is stated quietly rather than as a loading state
                that would imply the answer is still incomplete. */}
            <span className="ml-auto flex items-center gap-1.5 text-2xs text-muted-foreground">
              {narrating ? (
                <>
                  <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                  Writing the explanation…
                </>
              ) : result.is_fallback ? (
                "Written from the computed analysis"
              ) : (
                // An explanation cached before its model was recorded has no
                // name to show; say what wrote it rather than print "null".
                `Explained by ${result.model || result.provider || "the AI model"}`
              )}
            </span>
          </footer>

          {investigation.confidence_reason ? (
            <p className="text-xs leading-relaxed text-muted-foreground">
              {investigation.confidence_reason}
            </p>
          ) : null}

          {investigation.caveats.length ? (
            <ul className="space-y-1 border-t border-border pt-3">
              {investigation.caveats.map((caveat, index) => (
                <li key={index} className="text-2xs leading-relaxed text-muted-foreground">
                  {caveat}
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>

      {allEvidence.length ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="text-sm">
              Evidence ({allEvidence.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <EvidenceList evidence={allEvidence} currency={currency} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Info;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3" aria-hidden="true" />
        {title}
      </h3>
      {children}
    </section>
  );
}

function FindingList({ findings }: { findings: Finding[] }) {
  if (!findings.length) return null;
  return (
    <ul className="space-y-1.5">
      {findings.map((finding, index) => (
        <li key={index} className="flex gap-2 text-sm leading-relaxed">
          <CheckCircle2
            className={cn("mt-1 size-3 shrink-0 text-muted-foreground/60")}
            aria-hidden="true"
          />
          <span>{finding.statement}</span>
        </li>
      ))}
    </ul>
  );
}
