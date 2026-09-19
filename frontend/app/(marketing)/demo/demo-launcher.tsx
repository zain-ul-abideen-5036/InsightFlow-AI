"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";

import { Logo } from "@/components/logo";
import { ErrorState } from "@/components/states/error-state";
import { Button } from "@/components/ui/button";

/**
 * The steps this page waits on.
 *
 * Each one corresponds to work the server genuinely does while the request is
 * open — generate the sample orders, read and profile them, infer what the
 * columns mean, queue the analysis. The page advances through them on a timer
 * rather than by polling, so they are presented as *what is happening*, never
 * as a percentage: a progress bar that is not measuring anything is a lie told
 * to make waiting feel shorter.
 */
const STEPS = [
  "Creating your demo workspace",
  "Generating fifteen months of NovaMart orders",
  "Reading the file and profiling every column",
  "Working out what each field means",
  "Starting the analysis",
] as const;

const STEP_INTERVAL_MS = 1400;

interface ApiError {
  error?: { message?: string; hint?: string };
}

export function DemoLauncher() {
  const router = useRouter();
  const [step, setStep] = React.useState(0);
  const [error, setError] = React.useState<{ message: string; hint?: string } | null>(null);
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;

    const ticker = window.setInterval(() => {
      // Stop one short of the end: the last step is only complete when the
      // server says so, and claiming otherwise would be the fake progress this
      // component exists to avoid.
      setStep((current) => Math.min(current + 1, STEPS.length - 1));
    }, STEP_INTERVAL_MS);

    fetch("/api/auth/demo", { method: "POST" })
      .then(async (response) => {
        if (cancelled) return;
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as ApiError | null;
          setError({
            message: body?.error?.message ?? "We could not start the demo.",
            hint:
              body?.error?.hint ??
              "You can still create an account and load the same sample data.",
          });
          return;
        }
        setStep(STEPS.length);
        // The analysis runs in the background; the dashboard shows its real
        // progress, so there is nothing to wait for here.
        router.replace("/overview");
      })
      .catch(() => {
        if (cancelled) return;
        setError({
          message: "We could not reach the analysis service.",
          hint: "Check your connection and try again.",
        });
      })
      .finally(() => window.clearInterval(ticker));

    return () => {
      cancelled = true;
      window.clearInterval(ticker);
    };
  }, [router, attempt]);

  if (error) {
    return (
      <div className="w-full max-w-md space-y-5">
        <ErrorState
          title="The demo could not start"
          message={error.message}
          hint={error.hint}
          onRetry={() => {
            setError(null);
            setStep(0);
            setAttempt((n) => n + 1);
          }}
        />
        <div className="flex justify-center">
          <Button variant="outline" asChild>
            <Link href="/signup">Create an account instead</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-lg">
      <div className="flex flex-col items-center text-center">
        <Logo size="lg" showWordmark={false} />
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">
          Setting up your demo
        </h1>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          You are about to explore <strong className="font-medium text-foreground">NovaMart</strong>,
          a fictional online retailer with fifteen months of order history. The data is
          generated, but the story in it is real: a stockout, a region losing share, a
          flash sale, and a week of unusual cancellations.
        </p>
      </div>

      <ol className="mt-8 space-y-2.5" aria-live="polite">
        {STEPS.map((label, index) => {
          const done = index < step;
          const active = index === step;
          return (
            <li
              key={label}
              className="flex items-center gap-3 rounded-md border border-border bg-card px-4 py-3"
            >
              <span className="flex size-5 shrink-0 items-center justify-center" aria-hidden="true">
                {done ? (
                  <Check className="size-4 text-success" />
                ) : active ? (
                  <Loader2 className="size-4 animate-spin text-primary" />
                ) : (
                  <span className="size-2 rounded-full bg-border" />
                )}
              </span>
              <span
                className={
                  done || active
                    ? "text-sm text-foreground"
                    : "text-sm text-muted-foreground"
                }
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>

      <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
        Demo workspaces are private to you and are deleted automatically. Nothing you do
        here affects anyone else.
      </p>
    </div>
  );
}
