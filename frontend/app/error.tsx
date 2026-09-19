"use client";

import * as React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Root error boundary.
 *
 * Shows a readable message and a way forward. The underlying error is logged to
 * the console for developers but never rendered, because it can contain
 * internal paths and identifiers.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("Unhandled application error:", error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-danger-subtle text-danger">
        <AlertTriangle className="size-6" aria-hidden="true" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          We hit an unexpected problem loading this page. Trying again usually resolves it.
        </p>
        {error.digest ? (
          <p className="text-2xs text-muted-foreground">Reference: {error.digest}</p>
        ) : null}
      </div>
      <Button onClick={reset}>
        <RefreshCw aria-hidden="true" />
        Try again
      </Button>
    </div>
  );
}
