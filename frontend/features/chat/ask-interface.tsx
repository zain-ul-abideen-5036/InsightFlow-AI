"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowUp, CornerDownLeft, Search, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ASK_STAGES, StagedProgress } from "@/components/ui/staged-progress";
import { Textarea } from "@/components/ui/textarea";
import { AnswerCard } from "@/features/chat/answer-card";
import { api, ClientApiError, queryKeys } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/types/api";

/**
 * Ask InsightFlow.
 *
 * Deliberately not a chat UI. There are no avatars, no typing dots, no message
 * bubbles: this is an analyst answering a question with evidence, and dressing
 * it as a chatbot would set the wrong expectation about where the numbers come
 * from.
 *
 * The previous version said that in a comment and then did the opposite — the
 * question rendered as a blue right-aligned bubble, which is the single most
 * recognisable chat convention there is. It is now a quoted prompt heading
 * above its own answer, which is how a report reads.
 *
 * The empty state was three disconnected blocks: a dashed placeholder box, a
 * wrapped row of suggestion pills beneath it, and a composer beneath that. It
 * is now one composed entry screen — the question is the hero, the composer
 * sits directly under it, and the examples are a structured list rather than
 * a heap of buttons.
 */
export function AskInterface({
  workspaceId,
  currency = "USD",
  initialSuggestions = [],
}: {
  workspaceId: string;
  currency?: string;
  initialSuggestions?: string[];
}) {
  const searchParams = useSearchParams();
  const [question, setQuestion] = React.useState("");
  const [sessionId, setSessionId] = React.useState<string | undefined>();
  const [history, setHistory] = React.useState<{ question: string; answer: ChatMessage }[]>([]);
  const [askedAt, setAskedAt] = React.useState<number | undefined>();
  const endRef = React.useRef<HTMLDivElement>(null);
  const composerRef = React.useRef<HTMLTextAreaElement>(null);

  const suggestions = useQuery({
    queryKey: queryKeys.chatSuggestions(workspaceId),
    queryFn: () => api.chatSuggestions(workspaceId),
    initialData: initialSuggestions,
  });

  const ask = useMutation({
    mutationFn: (text: string) =>
      api.ask(workspaceId, { question: text, session_id: sessionId }),
    onMutate: () => setAskedAt(Date.now()),
    onSuccess: (response, text) => {
      setSessionId(response.session.id);
      setHistory((current) => [...current, { question: text, answer: response.message }]);
      setQuestion("");
    },
  });

  const submit = React.useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (trimmed.length < 2 || ask.isPending) return;
      ask.mutate(trimmed);
    },
    [ask],
  );

  // Fire a question passed in from a dashboard link, exactly once.
  const prefilled = searchParams.get("q");
  const firedRef = React.useRef(false);
  React.useEffect(() => {
    if (prefilled && !firedRef.current) {
      firedRef.current = true;
      submit(prefilled);
    }
  }, [prefilled, submit]);

  React.useEffect(() => {
    if (history.length === 0 && !ask.isPending) return;
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [history.length, ask.isPending]);

  const error = ask.error as ClientApiError | null;
  const started = history.length > 0 || ask.isPending;

  const composer = (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit(question);
      }}
      className="relative"
    >
      <label htmlFor="question" className="sr-only">
        Your question
      </label>
      <Textarea
        id="question"
        ref={composerRef}
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        onKeyDown={(event) => {
          // Enter sends; Shift+Enter adds a newline. Questions are short.
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submit(question);
          }
        }}
        placeholder="Why did revenue decline last month?"
        rows={started ? 2 : 3}
        maxLength={500}
        disabled={ask.isPending}
        className={cn(
          "resize-none rounded-xl bg-card pb-11 pr-4 text-base shadow-e1",
          "transition-shadow duration-base focus-visible:shadow-e2",
        )}
      />
      <div className="pointer-events-none absolute inset-x-3 bottom-2.5 flex items-center justify-between gap-3">
        <span className="hidden text-2xs text-subtle-foreground sm:inline">
          Answers are computed from your data, never generated.
        </span>
        <Button
          type="submit"
          size="sm"
          className="pointer-events-auto ml-auto"
          disabled={question.trim().length < 2 || ask.isPending}
          loading={ask.isPending}
          loadingText="Working"
        >
          Ask
          <CornerDownLeft aria-hidden="true" />
        </Button>
      </div>
    </form>
  );

  // ----------------------------------------------------------- Entry screen
  if (!started) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-7 py-4 sm:py-10">
        <header className="space-y-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-2xs font-medium text-muted-foreground shadow-e0">
            <Sparkles className="size-3 text-primary" aria-hidden="true" />
            Evidence-backed answers
          </span>
          <h1 className="text-4xl font-semibold tracking-tight text-balance">
            Ask InsightFlow
          </h1>
          <p className="max-w-prose text-md leading-relaxed text-muted-foreground">
            Ask about your business in plain English. InsightFlow turns the question into an
            analysis, runs it against your data, and shows you the figures behind the answer.
            If the data cannot answer it, it says so.
          </p>
        </header>

        {composer}

        {suggestions.data && suggestions.data.length > 0 ? (
          <section aria-labelledby="examples-heading" className="space-y-2.5">
            <h2 id="examples-heading" className="eyebrow">
              Questions this data can answer
            </h2>
            {/*
              A list, not a heap of pills. These are the product's opening
              move for a first-time user, and they were previously wrapped
              into an undifferentiated block below a dashed placeholder.
            */}
            <ul className="overflow-hidden rounded-xl border border-border bg-card shadow-e1">
              {suggestions.data.slice(0, 6).map((item, index) => (
                <li key={item} className={cn(index > 0 && "border-t border-border")}>
                  <button
                    type="button"
                    onClick={() => submit(item)}
                    disabled={ask.isPending}
                    className={cn(
                      "group flex w-full items-center gap-3 px-4 py-3 text-left",
                      "transition-colors duration-fast hover:bg-accent/60",
                      "focus-visible:outline-none focus-visible:bg-accent/60",
                      "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    )}
                  >
                    <Search
                      className="size-4 shrink-0 text-subtle-foreground transition-colors group-hover:text-primary"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 text-sm">{item}</span>
                    <ArrowUp
                      className="size-3.5 shrink-0 rotate-45 text-subtle-foreground/0 transition-colors group-hover:text-subtle-foreground"
                      aria-hidden="true"
                    />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {error ? <AskError error={error} /> : null}

        <HowAnswersWork />
      </div>
    );
  }

  // ------------------------------------------------------------ Transcript
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Ask InsightFlow</h1>
        <p className="text-xs text-subtle-foreground">
          Every figure below is computed from your data and can be opened.
        </p>
      </header>

      <div className="space-y-8">
        {history.map((entry, index) => (
          <section key={index} className="space-y-3" aria-label={`Question: ${entry.question}`}>
            <QuestionHeading>{entry.question}</QuestionHeading>
            <AnswerCard
              message={entry.answer}
              currency={currency}
              onFollowUp={submit}
              busy={ask.isPending}
            />
          </section>
        ))}

        {ask.isPending ? (
          <section className="space-y-3">
            <QuestionHeading>{ask.variables}</QuestionHeading>
            {/*
              Five real stages instead of one spinner and the word
              "Analysing". Against a local model on a CPU this wait is
              minutes, and a single static line for three hundred seconds is
              how a working product convinces someone it has crashed.
            */}
            <StagedProgress
              stages={ASK_STAGES}
              elapsedFrom={askedAt}
              label="Answering your question"
            />
          </section>
        ) : null}

        {error ? <AskError error={error} /> : null}

        <div ref={endRef} />
      </div>

      {/* --------------------------------------------------------- Composer */}
      {/*
        Docked, with a real surface and a top edge. It used to be
        `sticky bottom-0` over a background matching the page, so scrolled
        content ran underneath it with nothing between the two — which reads
        as a rendering fault rather than as a docked control.
      */}
      <div className="sticky bottom-0 -mx-4 mt-2 border-t border-border bg-background/85 px-4 pb-4 pt-3 backdrop-blur-xl sm:-mx-6 sm:px-6">
        {composer}
      </div>
    </div>
  );
}

/**
 * What happens when you press Ask.
 *
 * The entry screen had most of a page of nothing below the fold. This is the
 * one thing worth putting there: the product's actual differentiator, stated
 * plainly at the moment a first-time user is deciding whether to trust the
 * answer they are about to get.
 */
function HowAnswersWork() {
  const steps = [
    {
      title: "Your question becomes a plan",
      body: "A metric, a dimension, a period — typed and inspectable before anything runs.",
    },
    {
      title: "The engine computes the figures",
      body: "In pandas, over your rows. The model never does the arithmetic.",
    },
    {
      title: "Every claim is checked back",
      body: "A figure the analysis did not produce is discarded, not shown to you.",
    },
  ];

  return (
    <section
      aria-labelledby="how-answers-heading"
      className="rounded-xl border border-border bg-surface-sunken/60 px-5 py-4"
    >
      <h2 id="how-answers-heading" className="eyebrow">
        How an answer is produced
      </h2>
      <ol className="mt-3 grid gap-4 sm:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.title} className="min-w-0">
            <span
              className="tabular inline-flex size-5 items-center justify-center rounded-md bg-card text-2xs font-semibold text-primary ring-1 ring-inset ring-border"
              aria-hidden="true"
            >
              {index + 1}
            </span>
            <p className="mt-1.5 text-sm font-semibold">{step.title}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** The question, quoted as a heading over its answer — not a chat bubble. */
function QuestionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 border-l-2 border-primary/35 pl-3.5">
      <h2 className="text-lg font-medium leading-snug text-foreground/85 text-pretty">
        {children}
      </h2>
    </div>
  );
}

function AskError({ error }: { error: ClientApiError }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-danger-border bg-danger-subtle px-4 py-3.5"
    >
      <p className="text-sm font-semibold">{error.payload.message}</p>
      {error.payload.hint ? (
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{error.payload.hint}</p>
      ) : null}
    </div>
  );
}
