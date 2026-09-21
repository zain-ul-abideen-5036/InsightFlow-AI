"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface FormError {
  message: string;
  hint?: string;
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = React.useState<FormError | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  // `next` lets middleware return the user to where they were heading. Only
  // relative paths are honoured, so it cannot be used as an open redirect.
  const rawNext = searchParams.get("next");
  const next = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/overview";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: String(form.get("email") ?? "").trim(),
          password: String(form.get("password") ?? ""),
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError({
          message: body?.error?.message ?? "That email address or password is incorrect.",
          hint: body?.error?.hint,
        });
        setSubmitting(false);
        return;
      }

      // A full navigation, not a client push: the session cookie was just set
      // and every server component needs to re-render with it.
      router.push(next);
      router.refresh();
    } catch {
      setError({
        message: "We could not reach the server.",
        hint: "Check your connection and try again.",
      });
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-danger-border bg-danger-subtle px-4 py-3.5"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-foreground">{error.message}</p>
            {error.hint ? (
              <p className="text-xs text-muted-foreground">{error.hint}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="email">Email address</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          required
          autoFocus
          invalid={Boolean(error)}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link
            href="/reset-password"
            className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          invalid={Boolean(error)}
        />
      </div>

      <Button type="submit" size="lg" className="w-full" loading={submitting} loadingText="Signing in…">
        Sign in
      </Button>
    </form>
  );
}
