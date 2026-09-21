import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { ResetPasswordForm } from "@/features/auth/reset-password-form";

export const metadata: Metadata = {
  title: "Reset your password",
  description: "Request a password reset link for your InsightFlow AI account.",
};

export default function ResetPasswordPage() {
  return (
    <div className="space-y-7">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Reset your password</h1>
        <p className="text-md leading-relaxed text-muted-foreground">
          Enter your email address and we will send you a reset link.
        </p>
      </div>

      <Suspense fallback={<div className="h-[200px]" />}>
        <ResetPasswordForm />
      </Suspense>

      <p className="text-sm text-muted-foreground">
        Remembered it?{" "}
        <Link
          href="/login"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
