"use client";

import * as React from "react";
import { CircleAlert, Eye, Info, ListChecks, Workflow } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EvidenceList } from "@/features/insights/evidence-panel";
import type { ChatMessage, Confidence } from "@/types/api";

const CONFIDENCE_VARIANT: Record<Confidence, "success" | "warning" | "neutral"> = {
  high: "success",
  moderate: "warning",
  low: "neutral",
};

/**
 * One answer.
 *
 * Structured into the sections a business owner actually needs — what changed,
 * what supports it, what might explain it, what to do — rather than a wall of
 * prose. Explanations are visually separated from observations so a hypothesis
 * is never mistaken for a finding.
 */
/**
 * Is one string just the other again?
 *
 * Compared with punctuation and case removed, so "Revenue fell 13.9%." and
 * "Revenue fell 13.9% " count as the same sentence — which is what a reader
 * seeing them stacked would conclude too.
 */
function isRestatement(summary: string | undefined, headline: string): boolean {
  if (!summary?.trim()) return true;
  const normalise = (text: string) =>
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  return normalise(summary) === normalise(headline);
}

export function AnswerCard({
  message,
  currency = "USD",
}: {
  message: ChatMessage;
  currency?: string;
}) {
  const [evidenceOpen, setEvidenceOpen] = React.useState(false);
  const [planOpen, setPlanOpen] = React.useState(false);

  const answer = message.structured;
  const evidence = message.evidence?.items ?? [];
  const insufficient = message.evidence?.insufficient ?? [];

  if (!answer) {
    return (
      <div className="rounded-lg border border-border bg-card px-4 py-3.5">
        <p className="text-sm">{message.content}</p>
      </div>
    );
  }

  return (
    <>
      <article className="space-y-4 rounded-lg border border-border bg-card p-5">
        <header className="space-y-1.5">
          <h3 className="text-lg font-semibold leading-snug tracking-tight">
            {answer.headline}
          </h3>
          {/* When no model is available the engine writes both fields, and for
              a simple question the best summary it can write *is* the
              headline. Printing it twice reads as a rendering fault rather
              than as an answer. */}
          {isRestatement(answer.summary, answer.headline) ? null : (
            <p className="text-sm leading-relaxed text-muted-foreground">{answer.summary}</p>
          )}
        </header>

        {answer.observations.length ? (
          <section className="space-y-2">
            <h4 className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
              What the data shows
            </h4>
            <ul className="space-y-1.5">
              {answer.observations.map((observation, index) => (
                <li key={index} className="flex gap-2 text-sm leading-relaxed">
                  <span className="mt-[0.45rem] size-1 shrink-0 rounded-full bg-foreground/40" aria-hidden="true" />
                  <span>{observation.statement}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {answer.possible_explanations.length ? (
          <section className="space-y-2 rounded-md border border-border bg-surface px-3.5 py-3">
            <h4 className="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
              <Info className="size-3" aria-hidden="true" />
              Possible explanations
            </h4>
            {/* Visually distinct from observations: these are hypotheses, and
                the design must not let them read as established fact. */}
            <ul className="space-y-1.5">
              {answer.possible_explanations.map((explanation, index) => (
                <li key={index} className="text-sm leading-relaxed text-muted-foreground">
                  {explanation}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {answer.recommended_actions.length ? (
          <section className="space-y-2">
            <h4 className="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
              <ListChecks className="size-3" aria-hidden="true" />
              What to check next
            </h4>
            <ul className="space-y-1.5">
              {answer.recommended_actions.map((action, index) => (
                <li key={index} className="flex gap-2 text-sm leading-relaxed">
                  <span className="text-muted-foreground" aria-hidden="true">
                    →
                  </span>
                  <span>{action}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {insufficient.length ? (
          <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-subtle px-3.5 py-2.5">
            <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden="true" />
            <div className="space-y-0.5">
              {insufficient.map((reason, index) => (
                <p key={index} className="text-xs leading-relaxed">
                  {reason}
                </p>
              ))}
            </div>
          </div>
        ) : null}

        <footer className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <Badge variant={CONFIDENCE_VARIANT[answer.confidence]}>
            Confidence: {answer.confidence}
          </Badge>

          {evidence.length ? (
            <Button variant="outline" size="sm" onClick={() => setEvidenceOpen(true)}>
              <Eye aria-hidden="true" />
              View evidence
              <span className="text-muted-foreground">({evidence.length})</span>
            </Button>
          ) : null}

          {message.plan ? (
            <Button variant="ghost" size="sm" onClick={() => setPlanOpen(true)}>
              <Workflow aria-hidden="true" />
              How this was worked out
            </Button>
          ) : null}

          <span className="ml-auto text-2xs text-muted-foreground">
            {message.is_fallback
              ? "Written from the computed analysis"
              : `Explained by ${message.model ?? message.provider}`}
          </span>
        </footer>
      </article>

      {/* ------------------------------------------------------- Evidence */}
      <Dialog open={evidenceOpen} onOpenChange={setEvidenceOpen}>
        <DialogContent size="lg" className="max-h-[85dvh]">
          <DialogHeader>
            <DialogTitle>Evidence</DialogTitle>
            <DialogDescription>
              Every figure used in this answer, with the calculation behind it. Nothing in the
              answer above comes from anywhere else.
            </DialogDescription>
          </DialogHeader>
          <div className="-mx-1 overflow-y-auto px-1">
            <EvidenceList evidence={evidence} currency={currency} />
          </div>
        </DialogContent>
      </Dialog>

      {/* ----------------------------------------------------------- Plan */}
      <Dialog open={planOpen} onOpenChange={setPlanOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>How this was worked out</DialogTitle>
            <DialogDescription>
              Your question was turned into these steps, which ran against your data before
              anything was written.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="neutral">Intent: {message.plan?.intent.replace(/_/g, " ")}</Badge>
              <Badge variant="neutral">Metric: {message.plan?.metric.replace(/_/g, " ")}</Badge>
              {message.plan?.dimension ? (
                <Badge variant="neutral">By: {message.plan.dimension}</Badge>
              ) : null}
              <Badge variant="neutral">Grouped by: {message.plan?.grain}</Badge>
            </div>
            <ol className="space-y-2">
              {message.plan?.steps.map((step, index) => (
                <li key={index} className="flex gap-2.5 text-sm">
                  <span
                    className="tabular mt-0.5 flex size-5 shrink-0 items-center justify-center rounded bg-muted text-2xs font-medium text-muted-foreground"
                    aria-hidden="true"
                  >
                    {index + 1}
                  </span>
                  <span>
                    {step.description}
                    <span className="ml-1.5 font-mono text-2xs text-muted-foreground">
                      {step.operation}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
            {message.latency_ms ? (
              <p className="border-t border-border pt-2.5 text-2xs text-muted-foreground">
                Completed in {(message.latency_ms / 1000).toFixed(1)}s.
              </p>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
