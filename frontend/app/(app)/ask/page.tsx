import type { Metadata } from "next";
import { Suspense } from "react";

import { AskInterface } from "@/features/chat/ask-interface";
import { backendFetchOptional } from "@/lib/backend";
import { getActiveWorkspaceId } from "@/lib/session";
import type { Workspace } from "@/types/api";

export const metadata: Metadata = {
  title: "Ask InsightFlow",
  description: "Ask questions about your business and get evidence-backed answers.",
};

export const dynamic = "force-dynamic";

export default async function AskPage() {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return null;

  const [workspace, suggestions] = await Promise.all([
    backendFetchOptional<Workspace>(`/workspaces/${workspaceId}`),
    backendFetchOptional<string[]>(`/workspaces/${workspaceId}/chat/suggestions`),
  ]);

  return (
    <Suspense fallback={<div className="h-64" aria-busy="true" />}>
      <AskInterface
        workspaceId={workspaceId}
        currency={workspace?.currency ?? "USD"}
        initialSuggestions={suggestions ?? []}
      />
    </Suspense>
  );
}
