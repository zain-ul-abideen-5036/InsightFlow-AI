"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Password reset.
 *
 * Handles both halves of the flow. With a `token` in the URL the user sets a
 * new password; without one they request a link.
 */
export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = React.useState<"idle" | "sent" | "done">("idle");
  const [error, setError] = React.useState<{ message: string; hint?: string } | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  async function requestLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const form = new FormData(event.currentTarget);
    try {
      await fetch("/api/auth/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: String(form.get("email") ?? "").trim() }),
      });
      // Always reports success: whether an account exists must not be revealed.
      setStatus("sent");
    } catch {
      setError({ message: "We could not reach the server.", hint: "Try again in a moment." });
    } finally {
      setSubmitting(false);
    }
  }

  async function setNewPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password: String(form.get("password") ?? "") }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError({
          message: body?.error?.message ?? "That reset link is no longer valid.",
          hint: body?.error?.hint ?? "Request a new one and try again.",
        });
        setSubmitting(false);
        return;
      }

      setStatus("done");
      setTimeout(() => router.push("/login"), 1800);
    } catch {
      setError({ message: "We could not reach the server.", hint: "Try again in a moment." });
      setSubmitting(false);
    }
  }

  if (status === "sent") {
    return (
      <div
        role="status"
        className="flex flex-col items-center gap-3 rounded-lg border border-border bg-surface px-5 py-8 text-center"
      >
        <CheckCircle2 className="size-8 text-success" aria-hidden="true" />
        <p className="text-sm font-medium">Check your email</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          If an account exists for that address, we have sent password reset instructions.
        </p>
      </div>
    );
  }

  if (status === "done") {
    return (
      <div
        role="status"
        className="flex flex-col items-center gap-3 rounded-lg border border-border bg-surface px-5 py-8 text-center"
      >
        <CheckCircle2 className="size-8 text-success" aria-hidden="true" />
        <p className="text-sm font-medium">Password updated</p>
        <p className="text-sm text-muted-foreground">Taking you to the sign-in page…</p>
      </div>
    );
  }

  const errorBanner = error ? (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-md border border-danger/30 bg-danger-subtle px-3.5 py-3"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
      <div className="space-y-0.5">
        <p className="text-sm font-medium text-foreground">{error.message}</p>
        {error.hint ? <p className="text-xs text-muted-foreground">{error.hint}</p> : null}
      </div>
    </div>
  ) : null;

  if (token) {
    return (
      <form onSubmit={setNewPassword} className="space-y-4" noValidate>
        {errorBanner}
        <div className="space-y-2">
          <Label htmlFor="password" required>
            New password
          </Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            autoFocus
          />
          <p className="text-xs text-muted-foreground">At least 8 characters.</p>
        </div>
        <Button type="submit" className="w-full" loading={submitting} loadingText="Updating…">
          Set new password
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={requestLink} className="space-y-4" noValidate>
      {errorBanner}
      <div className="space-y-2">
        <Label htmlFor="email" required>
          Email address
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          required
          autoFocus
        />
      </div>
      <Button type="submit" className="w-full" loading={submitting} loadingText="Sending…">
        Send reset link
      </Button>
    </form>
  );
}
