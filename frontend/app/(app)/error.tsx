"use client";

import * as React from "react";

import { ErrorState } from "@/components/states/error-state";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("Dashboard error:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl py-12">
      <ErrorState
        title="We could not load this page"
        message="Something went wrong fetching your data. This is usually temporary."
        hint="If it keeps happening, check that the analysis service is running."
        onRetry={reset}
      />
    </div>
  );
}
