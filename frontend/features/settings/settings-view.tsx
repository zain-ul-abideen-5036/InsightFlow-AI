"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Cpu, Lock, ShieldOff, XCircle } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { api, ClientApiError, queryKeys } from "@/lib/api-client";
import type { AIStatus, User, Workspace } from "@/types/api";

const CURRENCIES = ["USD", "EUR", "GBP", "PKR", "AED", "INR", "CAD", "AUD", "SAR"];
const BUSINESS_TYPES = [
  { value: "ecommerce", label: "E-commerce" },
  { value: "retail", label: "Retail" },
  { value: "agency", label: "Agency" },
  { value: "saas", label: "SaaS" },
  { value: "services", label: "Services" },
  { value: "wholesale", label: "Wholesale" },
  { value: "other", label: "Other" },
];

export function SettingsView({
  workspace,
  user,
  aiStatus,
}: {
  workspace: Workspace;
  user: User;
  aiStatus: AIStatus | null;
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-7">
      <PageHeader
        title="Settings"
        description="Your workspace, your profile, and exactly what the AI layer receives."
      />

      <Tabs defaultValue="workspace">
        <TabsList>
          <TabsTrigger value="workspace">Workspace</TabsTrigger>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="ai">AI &amp; data</TabsTrigger>
        </TabsList>

        <TabsContent value="workspace">
          <WorkspaceSettings workspace={workspace} />
        </TabsContent>

        <TabsContent value="profile">
          <ProfileSettings user={user} />
        </TabsContent>

        <TabsContent value="ai">
          <AISettings initial={aiStatus} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function WorkspaceSettings({ workspace }: { workspace: Workspace }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = React.useState(workspace.name);
  const [currency, setCurrency] = React.useState(workspace.currency);
  const [businessType, setBusinessType] = React.useState(workspace.business_type);

  const save = useMutation({
    mutationFn: () =>
      api.updateWorkspace(workspace.id, {
        name,
        currency,
        business_type: businessType,
      }),
    onSuccess: () => {
      toast({ title: "Workspace updated", tone: "success" });
      queryClient.invalidateQueries({ queryKey: queryKeys.overview(workspace.id) });
    },
    onError: (error: ClientApiError) => {
      toast({ title: "Could not save", description: error.message, tone: "error" });
    },
  });

  const dirty =
    name !== workspace.name ||
    currency !== workspace.currency ||
    businessType !== workspace.business_type;

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Workspace</CardTitle>
        <CardDescription>
          Datasets, analyses, and reports all belong to this workspace, and are visible only
          to its members.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="workspace-name">Name</Label>
          <Input
            id="workspace-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={160}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="workspace-currency">Currency</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger id="workspace-currency">
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
              Used to format monetary figures. It does not convert them.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="workspace-type">Business type</Label>
            <Select value={businessType} onValueChange={setBusinessType}>
              <SelectTrigger id="workspace-type">
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
        </div>

        <div className="flex justify-end">
          <Button
            disabled={!dirty || !name.trim()}
            loading={save.isPending}
            loadingText="Saving…"
            onClick={() => save.mutate()}
          >
            Save changes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ProfileSettings({ user }: { user: User }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Profile</CardTitle>
        <CardDescription>The account you are signed in with.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="profile-name">Name</Label>
          <Input id="profile-name" defaultValue={user.full_name} readOnly />
        </div>
        <div className="space-y-2">
          <Label htmlFor="profile-email">Email address</Label>
          <Input id="profile-email" defaultValue={user.email} readOnly />
        </div>
        <div className="rounded-md border border-border bg-surface px-4 py-3">
          <p className="text-sm font-medium">Password</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Changing your password signs you out of every device, including this one.
          </p>
          <Button variant="outline" size="sm" className="mt-2.5" asChild>
            <a href="/reset-password">Change password</a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * AI transparency.
 *
 * States plainly which provider is active and exactly what is transmitted to
 * it. A business uploading its sales data deserves a precise answer to "what
 * leaves my machine?", not a privacy paragraph.
 */
function AISettings({ initial }: { initial: AIStatus | null }) {
  const { data: status, isLoading } = useQuery({
    queryKey: queryKeys.aiStatus,
    queryFn: () => api.aiStatus(),
    initialData: initial ?? undefined,
  });

  const isLocal = status?.provider === "ollama";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle as="h2" className="flex items-center gap-2">
            <Cpu className="size-4 text-muted-foreground" aria-hidden="true" />
            AI provider
          </CardTitle>
          <CardDescription>
            The AI layer writes explanations over figures the analytics engine has already
            computed. It never produces a number of its own.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="shimmer h-16 w-full rounded-md" />
          ) : status ? (
            <>
              <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface px-4 py-3">
                {status.available ? (
                  <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" />
                ) : (
                  <XCircle className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">
                      {status.provider === "none" ? "Disabled" : status.provider}
                    </p>
                    {status.model ? <Badge variant="neutral">{status.model}</Badge> : null}
                    {isLocal ? <Badge variant="success">Runs locally</Badge> : null}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{status.detail}</p>
                </div>
              </div>

              {!status.available ? (
                <div className="flex items-start gap-2.5 rounded-md border border-border bg-surface px-4 py-3">
                  <ShieldOff
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    The AI layer is unavailable, so answers and investigations are written
                    directly from the computed analysis. Every figure, insight, and anomaly is
                    unaffected — the wording is simply plainer.
                  </p>
                </div>
              ) : null}
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="flex items-center gap-2">
            <Lock className="size-4 text-muted-foreground" aria-hidden="true" />
            What is sent to the AI
          </CardTitle>
          <CardDescription>
            Exactly what leaves this application when an explanation is generated.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="space-y-2">
            {(status?.data_sent ?? []).map((item, index) => (
              <li key={index} className="flex gap-2 text-sm">
                <span
                  className="mt-[0.45rem] size-1 shrink-0 rounded-full bg-foreground/40"
                  aria-hidden="true"
                />
                <span className="text-muted-foreground">{item}</span>
              </li>
            ))}
          </ul>

          <div className="rounded-md border border-border bg-surface px-4 py-3">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Individual rows of your uploaded files are not sent.
              {status?.max_sample_rows
                ? ` If a future feature ever needs row-level context, it is capped at ${status.max_sample_rows} rows and stated in the interface.`
                : null}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
