import type { Metadata } from "next";

import { DatasetWorkflow } from "@/features/datasets/dataset-workflow";
import { getActiveWorkspaceId } from "@/lib/session";

export const metadata: Metadata = {
  title: "Upload data",
  description: "Upload a CSV or Excel file to analyse.",
};

export default async function NewDatasetPage() {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Upload your data</h1>
        <p className="text-md text-muted-foreground">
          A CSV or Excel export of your orders, sales, or transactions. We will show you what
          we found before anything is analysed.
        </p>
      </header>

      <DatasetWorkflow
        workspaceId={workspaceId}
        demoEnabled={process.env.NEXT_PUBLIC_DEMO_ENABLED !== "false"}
      />
    </div>
  );
}
