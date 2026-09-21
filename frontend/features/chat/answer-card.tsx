"use client";

import * as React from "react";
import {
  ArrowRight,
  CircleAlert,
  Eye,
  Lightbulb,
  ListChecks,
  Workflow,
} from "lucide-react";

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
import { followUpsFor } from "@/features/chat/follow-ups";
import { cn, formatValue } from "@/lib/utils";
import type { ChatMessage, Confidence, Evidence } from "@/types/api";

const CONFIDENCE_VARIANT: Record<Confidence, "success" | "warning" | "neutral"> = {
  high: "success",
  moderate: "warning",
  low: "neutral",
};

const CONFIDENCE_NOTE: Record<Confidence, string> = {
  high: "The data supports this directly.",
  moderate: "The data supports this, with caveats.",
  low: "The data is thin here — treat this as indicative.",
};

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

/**
 * One answer.
 *
 * The brief's structure — Answer, Evidence, What changed, Possible
 * explanation, Investigate further — already existed in the data. What was
 * missing was any way to *see* it: everything rendered as one undifferentiated
 * card, with 11px grey caps separating sections and a thin border as the only
 * thing distinguishing an established fact from a hypothesis.
 *
 * The distinction between the two is the whole product. It is now carried by
 * the layout:
 *
 * - **The conclusion** gets display weight and sits alone at the top.
 * - **Evidence** is a row of actual figures, on their own surface, not prose.
 * - **Observations** are plain statements, because that is what they are.
 * - **Possible explanations** sit in a visibly separate, tinted block with an
 *   icon and a caveat in its heading — a reader skimming cannot mistake one
 *   for the other.
 * - **Investigate further** turns the dead end at the bottom of an answer
 *   into the next question.
 */
export function AnswerCard({
  message,
  currency = "USD",
  onFollowUp,
  busy = false,
}: {
  message: ChatMessage;
  currency?: string;
  onFollowUp?: (question: string) => void;
  busy?: boolean;
}) {
  const [evidenceOpen, setEvidenceOpen] = React.useState(false);
  const [planOpen, setPlanOpen] = React.useState(false);

  const answer = message.structured;
  const evidence = message.evidence?.items ?? [];
  const insufficient = message.evidence?.insufficient ?? [];
  const followUps = followUpsFor(message.plan);

  if (!answer) {
    return (
      <div className="panel px-5 py-4">
        <p className="text-base leading-relaxed">{message.content}</p>
      </div>
    );
  }

  /** The two or three figures worth putting in front of the reader. */
  const headlineEvidence = evidence
    .filter((item) => typeof item.value === "number")
    .slice(0, 3);

  return (
    <>
      <article className="panel overflow-hidden">
        {/* ------------------------------------------------------- Answer */}
        <header className="space-y-2 px-5 pt-5 sm:px-6 sm:pt-6">
          <p className="eyebrow">Answer</p>
          <h3 className="text-2xl font-semibold leading-tight tracking-tight text-balance">
            {answer.headline}
          </h3>
          {/* When no model is available the engine writes both fields, and for
              a simple question the best summary it can write *is* the
              headline. Printing it twice reads as a rendering fault rather
              than as an answer. */}
          {isRestatement(answer.summary, answer.headline) ? null : (
            <p className="max-w-prose text-base leading-relaxed text-muted-foreground text-pretty">
              {answer.summary}
            </p>
          )}
        </header>

        {/* ----------------------------------------------------- Evidence */}
        {headlineEvidence.length ? (
          <div className="mt-5 border-y border-border bg-surface-sunken/70 px-5 py-4 sm:px-6">
            <div className="flex items-center justify-between gap-3">
              <p className="eyebrow">Evidence</p>
              {evidence.length > headlineEvidence.length ? (
                <button
                  type="button"
                  onClick={() => setEvidenceOpen(true)}
                  className="rounded-sm text-2xs font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  All {evidence.length} figures
                </button>
              ) : null}
            </div>
            <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-3">
              {headlineEvidence.map((item, index) => (
                <EvidenceFigure
                  key={`${item.label}-${index}`}
                  item={item}
                  currency={currency}
                />
              ))}
            </dl>
          </div>
        ) : null}

        <div className="space-y-5 px-5 py-5 sm:px-6">
          {/* ------------------------------------------- What the data shows */}
          {answer.observations.length ? (
            <section className="space-y-2.5">
              <h4 className="eyebrow">What the data shows</h4>
              <ul className="space-y-2">
                {answer.observations.map((observation, index) => (
                  <li key={index} className="flex gap-2.5 text-base leading-relaxed">
                    <span
                      className="mt-[0.6rem] size-1.5 shrink-0 rounded-full bg-primary/55"
                      aria-hidden="true"
                    />
                    <span className="text-pretty">{observation.statement}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* --------------------------------------- Possible explanations */}
          {answer.possible_explanations.length ? (
            // Visually distinct from observations: these are hypotheses, and
            // the design must not let them read as established fact.
            <section className="rounded-xl border border-warning-border/60 bg-warning-subtle/50 px-4 py-3.5">
              <h4 className="flex flex-wrap items-baseline gap-x-2 text-xs font-semibold text-warning">
                <span className="inline-flex items-center gap-1.5">
                  <Lightbulb className="size-3.5" aria-hidden="true" />
                  Possible explanation
                </span>
                <span className="text-2xs font-normal text-muted-foreground">
                  consistent with the data — not established by it
                </span>
              </h4>
              <ul className="mt-2.5 space-y-2">
                {answer.possible_explanations.map((explanation, index) => (
                  <li
                    key={index}
                    className="text-sm leading-relaxed text-foreground/85 text-pretty"
                  >
                    {explanation}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* ------------------------------------------ What to check next */}
          {answer.recommended_actions.length ? (
            <section className="space-y-2.5">
              <h4 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <ListChecks className="size-3.5" aria-hidden="true" />
                What to check next
              </h4>
              <ul className="space-y-1.5">
                {answer.recommended_actions.map((action, index) => (
                  <li key={index} className="flex gap-2.5 text-sm leading-relaxed">
                    <ArrowRight
                      className="mt-1 size-3.5 shrink-0 text-subtle-foreground"
                      aria-hidden="true"
                    />
                    <span className="text-pretty">{action}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {insufficient.length ? (
            <div className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/60 px-4 py-3">
              <CircleAlert
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <div className="space-y-1">
                <p className="text-xs font-semibold">What this answer could not cover</p>
                {insufficient.map((reason, index) => (
                  <p key={index} className="text-xs leading-relaxed text-muted-foreground">
                    {reason}
                  </p>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* --------------------------------------------- Investigate further */}
        {followUps.length && onFollowUp ? (
          <div className="border-t border-border bg-surface-sunken/70 px-5 py-4 sm:px-6">
            <p className="eyebrow">Investigate further</p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {followUps.map((followUp) => (
                <button
                  key={followUp.question}
                  type="button"
                  disabled={busy}
                  onClick={() => onFollowUp(followUp.question)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border border-border bg-card",
                    "px-3 py-1.5 text-xs font-medium text-foreground shadow-e0",
                    "transition-[background-color,border-color,transform] duration-fast ease-out",
                    "hover:border-border-strong hover:bg-accent active:scale-[0.98]",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    "disabled:pointer-events-none disabled:opacity-45",
                  )}
                >
                  {followUp.label}
                  <ArrowRight className="size-3 text-subtle-foreground" aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* ------------------------------------------------------- Footer */}
        <footer className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border px-5 py-3 sm:px-6">
          <Badge variant={CONFIDENCE_VARIANT[answer.confidence]} size="lg" sentence>
            Confidence: {answer.confidence}
          </Badge>
          <span className="hidden text-2xs text-subtle-foreground sm:inline">
            {CONFIDENCE_NOTE[answer.confidence]}
          </span>

          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            {evidence.length ? (
              <Button variant="outline" size="sm" onClick={() => setEvidenceOpen(true)}>
                <Eye aria-hidden="true" />
                View evidence
                <span className="text-subtle-foreground">({evidence.length})</span>
              </Button>
            ) : null}

            {message.plan ? (
              <Button variant="ghost" size="sm" onClick={() => setPlanOpen(true)}>
                <Workflow aria-hidden="true" />
                How this was worked out
              </Button>
            ) : null}
          </div>

          <span className="w-full text-2xs text-subtle-foreground sm:w-auto sm:basis-full">
            {message.is_fallback
              ? "Written from the computed analysis — no model was used."
              : `Figures computed by the analytics engine; phrasing by ${
                  message.model ?? message.provider
                }.`}
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
            <div className="flex flex-wrap gap-1.5">
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
                    className="tabular mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-muted text-2xs font-semibold text-muted-foreground"
                    aria-hidden="true"
                  >
                    {index + 1}
                  </span>
                  <span className="leading-relaxed">
                    {step.description}
                    <span className="ml-1.5 font-mono text-2xs text-subtle-foreground">
                      {step.operation}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
            {message.latency_ms ? (
              <p className="border-t border-border pt-2.5 text-2xs text-subtle-foreground">
                Completed in {(message.latency_ms / 1000).toFixed(1)}s.
              </p>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** One figure from the evidence bundle, shown as data rather than as prose. */
function EvidenceFigure({ item, currency }: { item: Evidence; currency: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-2xs text-muted-foreground" title={item.label}>
        {item.label}
      </dt>
      <dd className="tabular mt-0.5 text-lg font-semibold leading-tight">
        {typeof item.value === "number"
          ? formatValue(item.value, item.unit, currency, { compact: true })
          : (item.value ?? "—")}
      </dd>
      {item.period ? (
        <dd className="mt-0.5 truncate text-2xs text-subtle-foreground">{item.period}</dd>
      ) : null}
    </div>
  );
}
