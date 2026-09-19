"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CornerDownLeft, Loader2, MessageSquareText, Sparkles } from "lucide-react";

import { EmptyState } from "@/components/states/empty-state";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AnswerCard } from "@/features/chat/answer-card";
import { api, ClientApiError, queryKeys } from "@/lib/api-client";
import type { ChatMessage } from "@/types/api";

/**
 * Ask InsightFlow.
 *
 * Deliberately not a chat UI. There are no avatars, no typing dots, no message
 * bubbles: this is an analyst answering a question with evidence, and dressing
 * it as a chatbot would set the wrong expectation about where the numbers come
 * from.
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
  const endRef = React.useRef<HTMLDivElement>(null);

  const suggestions = useQuery({
    queryKey: queryKeys.chatSuggestions(workspaceId),
    queryFn: () => api.chatSuggestions(workspaceId),
    initialData: initialSuggestions,
  });

  const ask = useMutation({
    mutationFn: (text: string) =>
      api.ask(workspaceId, { question: text, session_id: sessionId }),
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
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [history.length, ask.isPending]);

  const error = ask.error as ClientApiError | null;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Ask InsightFlow</h1>
        <p className="text-md text-muted-foreground">
          Ask about your business in plain English. Every figure in the answer is computed
          from your data and can be opened to see how.
        </p>
      </header>

      {history.length === 0 && !ask.isPending ? (
        <EmptyState
          icon={MessageSquareText}
          title="What would you like to know?"
          description="InsightFlow plans an analysis for your question, runs it against your data, and explains the result. It will tell you if the data cannot answer what you asked."
        />
      ) : null}

      {/* ------------------------------------------------------- Transcript */}
      <div className="space-y-6">
        {history.map((entry, index) => (
          <div key={index} className="space-y-3">
            <div className="flex justify-end">
              <p className="max-w-[80%] rounded-lg rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">
                {entry.question}
              </p>
            </div>
            <AnswerCard message={entry.answer} currency={currency} />
          </div>
        ))}

        {ask.isPending ? (
          <div className="space-y-3">
            <div className="flex justify-end">
              <p className="max-w-[80%] rounded-lg rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">
                {ask.variables}
              </p>
            </div>
            <div
              className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-4 py-3.5"
              role="status"
            >
              <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium">Analysing your data</p>
                <p className="text-xs text-muted-foreground">
                  Planning the analysis, computing the figures, then writing the answer.
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {error ? (
          <div
            role="alert"
            className="rounded-lg border border-danger/30 bg-danger-subtle px-4 py-3"
          >
            <p className="text-sm font-medium">{error.payload.message}</p>
            {error.payload.hint ? (
              <p className="mt-0.5 text-xs text-muted-foreground">{error.payload.hint}</p>
            ) : null}
          </div>
        ) : null}

        <div ref={endRef} />
      </div>

      {/* -------------------------------------------------------- Composer */}
      <div className="sticky bottom-0 space-y-3 bg-surface pb-2 pt-3">
        {suggestions.data && suggestions.data.length > 0 && history.length === 0 ? (
          <div className="flex flex-wrap gap-2">
            {suggestions.data.map((item) => (
              <Button
                key={item}
                variant="outline"
                size="sm"
                onClick={() => submit(item)}
                disabled={ask.isPending}
              >
                <Sparkles aria-hidden="true" />
                {item}
              </Button>
            ))}
          </div>
        ) : null}

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
            rows={2}
            maxLength={500}
            disabled={ask.isPending}
            className="resize-none pr-24"
          />
          <Button
            type="submit"
            size="sm"
            className="absolute bottom-2.5 right-2.5"
            disabled={question.trim().length < 2 || ask.isPending}
            loading={ask.isPending}
          >
            Ask
            <CornerDownLeft aria-hidden="true" />
          </Button>
        </form>
      </div>
    </div>
  );
}
