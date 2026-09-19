"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { DatasetWorkflow } from "@/features/datasets/dataset-workflow";
import { api, ClientApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { Workspace } from "@/types/api";

const BUSINESS_TYPES = [
  { value: "ecommerce", label: "E-commerce" },
  { value: "retail", label: "Retail" },
  { value: "agency", label: "Agency" },
  { value: "saas", label: "SaaS" },
  { value: "services", label: "Services" },
  { value: "wholesale", label: "Wholesale" },
  { value: "other", label: "Other" },
];

const CURRENCIES = ["USD", "EUR", "GBP", "PKR", "AED", "INR", "CAD", "AUD", "SAR"];

type Stage = "business" | "data";

/**
 * First-run onboarding.
 *
 * Two steps only. The spec's five-step flow collapses naturally here because
 * upload, field review, and analysis already form their own guided sequence —
 * repeating them as outer steps would count the same work twice and make the
 * process feel longer than it is.
 */
export function OnboardingFlow({
  workspace,
  demoEnabled = true,
}: {
  workspace: Workspace;
  demoEnabled?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [stage, setStage] = React.useState<Stage>(
    workspace.onboarding_step >= 2 ? "data" : "business",
  );
  const [name, setName] = React.useState(workspace.name);
  const [businessType, setBusinessType] = React.useState(workspace.business_type);
  const [currency, setCurrency] = React.useState(workspace.currency);

  const save = useMutation({
    mutationFn: () =>
      api.updateWorkspace(workspace.id, {
        name: name.trim(),
        business_type: businessType,
        currency,
        onboarding_step: 2,
      }),
    onSuccess: () => {
      setStage("data");
      router.refresh();
    },
    onError: (error: ClientApiError) => {
      toast({ title: "Could not save", description: error.message, tone: "error" });
    },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-8 py-4">
      <header className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">
          Let&apos;s understand your business
        </h1>
        <p className="text-md text-muted-foreground">
          Two quick steps and you will be looking at your first analysis.
        </p>
      </header>

      <ol className="flex items-center justify-center gap-3" aria-label="Setup progress">
        {(
          [
            { key: "business", label: "About your business" },
            { key: "data", label: "Add your data" },
          ] as { key: Stage; label: string }[]
        ).map((item, index) => {
          const state =
            stage === item.key ? "current" : index === 0 && stage === "data" ? "done" : "todo";
          return (
            <li key={item.key} className="flex items-center gap-2">
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full text-2xs font-semibold",
                  state === "done" && "bg-success text-success-foreground",
                  state === "current" && "bg-primary text-primary-foreground",
                  state === "todo" && "bg-muted text-muted-foreground",
                )}
                aria-hidden="true"
              >
                {state === "done" ? <CheckCircle2 className="size-3.5" /> : index + 1}
              </span>
              <span
                className={cn(
                  "text-sm",
                  state === "current" ? "font-medium" : "text-muted-foreground",
                )}
                aria-current={state === "current" ? "step" : undefined}
              >
                {item.label}
              </span>
              {index === 0 ? (
                <span className="mx-2 h-px w-8 bg-border" aria-hidden="true" />
              ) : null}
            </li>
          );
        })}
      </ol>

      {stage === "business" ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
          className="space-y-5 rounded-lg border border-border bg-card p-6"
        >
          <div className="space-y-2">
            <Label htmlFor="onboarding-name" required>
              Business name
            </Label>
            <Input
              id="onboarding-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="NovaMart"
              required
              autoFocus
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="onboarding-type">What kind of business is it?</Label>
              <Select value={businessType} onValueChange={setBusinessType}>
                <SelectTrigger id="onboarding-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BUSINESS_TYPES.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="onboarding-currency">Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger id="onboarding-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((code) => (
                    <SelectItem key={code} value={code}>
                      {code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Used to format figures, not to convert them.
              </p>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={!name.trim()}
              loading={save.isPending}
              loadingText="Saving…"
            >
              Continue
              <ArrowRight aria-hidden="true" />
            </Button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          <div className="space-y-1 text-center">
            <h2 className="text-lg font-semibold">Add your data</h2>
            <p className="text-sm text-muted-foreground">
              A CSV or Excel export of your orders or sales. Nothing is analysed until you
              have reviewed what we detected.
            </p>
          </div>
          <DatasetWorkflow workspaceId={workspace.id} demoEnabled={demoEnabled} />
        </div>
      )}
    </div>
  );
}
