import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { OnboardingFlow } from "@/features/onboarding/onboarding-flow";
import { backendFetch } from "@/lib/backend";
import { getActiveWorkspaceId } from "@/lib/session";
import type { SessionResponse } from "@/types/api";

export const metadata: Metadata = {
  title: "Get started",
  description: "Set up your workspace and add your first dataset.",
};

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const session = await backendFetch<SessionResponse>("/auth/session");
  if (session.workspaces.length === 0) {
    // Signup always creates one, so this means something is genuinely wrong.
    redirect("/login");
  }

  const activeId = await getActiveWorkspaceId();
  const workspace =
    session.workspaces.find((item) => item.id === activeId) ?? session.workspaces[0]!;

  return (
    <OnboardingFlow
      workspace={workspace}
      demoEnabled={process.env.NEXT_PUBLIC_DEMO_ENABLED !== "false"}
    />
  );
}
