import type { Metadata } from "next";
import Link from "next/link";

import { SignupForm } from "@/features/auth/signup-form";

export const metadata: Metadata = {
  title: "Create your account",
  description: "Start analysing your business data with InsightFlow AI.",
};

export default function SignupPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1.5 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
        <p className="text-sm text-muted-foreground">
          Upload a spreadsheet and see what changed in your business.
        </p>
      </div>

      <SignupForm />

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
