"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const MIN_PASSWORD_LENGTH = 8;

/** Mirrors the backend's rules so the user is told before submitting. */
function passwordChecks(password: string) {
  return [
    { label: `At least ${MIN_PASSWORD_LENGTH} characters`, met: password.length >= MIN_PASSWORD_LENGTH },
    { label: "Not only numbers", met: password.length > 0 && !/^\d+$/.test(password) },
    {
      label: "Not a common password",
      met:
        password.length > 0 &&
        !["password", "12345678", "insightflow", "qwertyui"].includes(password.toLowerCase()),
    },
  ];
}

export function SignupForm() {
  const router = useRouter();
  const [error, setError] = React.useState<{ message: string; hint?: string } | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [password, setPassword] = React.useState("");

  const checks = passwordChecks(password);
  const passwordValid = checks.every((check) => check.met);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!passwordValid) {
      setError({ message: "Please choose a stronger password." });
      return;
    }

    setSubmitting(true);
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: String(form.get("email") ?? "").trim(),
          password: String(form.get("password") ?? ""),
          full_name: String(form.get("full_name") ?? "").trim(),
          business_name: String(form.get("business_name") ?? "").trim(),
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError({
          message: body?.error?.message ?? "We could not create that account.",
          hint: body?.error?.hint ?? body?.error?.details?.errors?.[0],
        });
        setSubmitting(false);
        return;
      }

      router.push("/onboarding");
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
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {error ? (
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
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="full_name">Your name</Label>
        <Input id="full_name" name="full_name" autoComplete="name" placeholder="Ada Lovelace" autoFocus />
      </div>

      <div className="space-y-2">
        <Label htmlFor="business_name">Business name</Label>
        <Input
          id="business_name"
          name="business_name"
          autoComplete="organization"
          placeholder="NovaMart"
        />
        <p className="text-xs text-muted-foreground">This becomes the name of your workspace.</p>
      </div>

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
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password" required>
          Password
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-describedby="password-requirements"
        />
        <ul id="password-requirements" className="space-y-1 pt-0.5">
          {checks.map((check) => (
            <li
              key={check.label}
              className={cn(
                "flex items-center gap-1.5 text-xs transition-colors",
                check.met ? "text-success" : "text-muted-foreground",
              )}
            >
              <Check
                className={cn("size-3 shrink-0", !check.met && "opacity-30")}
                aria-hidden="true"
              />
              {check.label}
            </li>
          ))}
        </ul>
      </div>

      <Button type="submit" className="w-full" loading={submitting} loadingText="Creating account…">
        Create account
      </Button>

      <p className="text-center text-2xs leading-relaxed text-muted-foreground">
        By creating an account you agree that uploaded data is processed to produce your
        analysis. You can delete a dataset, and everything derived from it, at any time.
      </p>
    </form>
  );
}
