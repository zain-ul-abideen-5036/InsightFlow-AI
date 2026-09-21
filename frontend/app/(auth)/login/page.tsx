import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { LoginForm } from "@/features/auth/login-form";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your InsightFlow AI workspace.",
};

export default function LoginPage() {
  return (
    <div className="space-y-7">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Welcome back</h1>
        <p className="text-md leading-relaxed text-muted-foreground">
          Sign in to continue to your workspace.
        </p>
      </div>

      <Suspense fallback={<div className="h-[280px]" />}>
        <LoginForm />
      </Suspense>

      <p className="text-sm text-muted-foreground">
        New to InsightFlow?{" "}
        <Link
          href="/signup"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}
