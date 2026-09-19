"use client";

import * as React from "react";
import { AlertTriangle, Check, CircleHelp, Info } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { FieldsResponse, Grain } from "@/types/api";

export interface FieldSelection {
  name: string;
  confirmed_role: string | null;
  is_included: boolean;
}

/**
 * "Review detected fields".
 *
 * Nothing is analysed until the user confirms this screen, because a wrong
 * schema silently poisons every figure downstream. Low-confidence detections
 * are flagged so attention lands where it is needed rather than on all 19 rows.
 */
export function FieldReview({
  fields,
  onConfirm,
  confirming,
}: {
  fields: FieldsResponse;
  onConfirm: (selections: FieldSelection[], grain: Grain | null) => void;
  confirming: boolean;
}) {
  const [selections, setSelections] = React.useState<Record<string, FieldSelection>>(() =>
    Object.fromEntries(
      fields.columns.map((column) => [
        column.name,
        {
          name: column.name,
          confirmed_role: column.confirmed_role ?? column.effective_role,
          is_included: column.is_included,
        },
      ]),
    ),
  );

  const [grain, setGrain] = React.useState<Grain | null>(fields.suggested_grain);

  const update = (name: string, patch: Partial<FieldSelection>) => {
    setSelections((current) => ({
      ...current,
      [name]: { ...current[name]!, ...patch },
    }));
  };

  const lowConfidence = fields.columns.filter(
    (column) => column.confidence < 0.6 && column.is_included,
  );

  const availableCapabilities = Object.entries(fields.capabilities).filter(
    ([, capability]) => capability.available,
  );
  const blockedCapabilities = Object.entries(fields.capabilities).filter(
    ([, capability]) => !capability.available,
  );

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------ Attention needed */}
      {lowConfidence.length ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning-subtle px-4 py-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <div className="space-y-0.5">
            <p className="text-sm font-medium">
              {lowConfidence.length} field{lowConfidence.length === 1 ? "" : "s"} need
              {lowConfidence.length === 1 ? "s" : ""} a look
            </p>
            <p className="text-xs text-muted-foreground">
              We were not confident about {lowConfidence.map((c) => c.name).join(", ")}. Setting
              these correctly matters — the analysis is only as good as the field meanings.
            </p>
          </div>
        </div>
      ) : null}

      {fields.warnings.length ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-border bg-surface px-4 py-3">
          <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="space-y-1">
            <p className="text-sm font-medium">While reading your file</p>
            <ul className="space-y-0.5 text-xs text-muted-foreground">
              {fields.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {/* -------------------------------------------------------- The table */}
      <div className="rounded-lg border border-border">
        <Table caption="Detected fields, with the meaning assigned to each column">
          <TableHeader>
            <TableRow>
              <TableHead>Column</TableHead>
              <TableHead>Detected type</TableHead>
              <TableHead>Meaning</TableHead>
              <TableHead>Sample</TableHead>
              <TableHead className="text-right">Include</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {fields.columns.map((column) => {
              const selection = selections[column.name]!;
              const uncertain = column.confidence < 0.6;
              const sample =
                (column.stats?.sample_values as string[] | undefined)?.[0] ??
                (column.stats?.min !== undefined ? String(column.stats.min) : "—");

              return (
                <TableRow
                  key={column.name}
                  className={cn(!selection.is_included && "opacity-50")}
                >
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-1.5">
                      {column.name}
                      {uncertain ? (
                        <TooltipProvider delayDuration={150}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span
                                tabIndex={0}
                                className="text-warning"
                                aria-label="Low confidence detection"
                              >
                                <CircleHelp className="size-3.5" aria-hidden="true" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              We were only {Math.round(column.confidence * 100)}% confident about
                              this one. Please check it.
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : null}
                    </div>
                  </TableCell>

                  <TableCell>
                    <Badge variant="neutral">{column.data_type}</Badge>
                  </TableCell>

                  <TableCell className="min-w-[180px]">
                    <Select
                      value={selection.confirmed_role ?? "unknown"}
                      onValueChange={(value) => update(column.name, { confirmed_role: value })}
                      disabled={!selection.is_included}
                    >
                      <SelectTrigger aria-label={`Meaning of ${column.name}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {fields.available_roles.map((role) => (
                          <SelectItem key={role.value} value={role.value}>
                            {role.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>

                  <TableCell className="max-w-[160px] truncate text-xs text-muted-foreground">
                    {String(sample)}
                  </TableCell>

                  <TableCell className="text-right">
                    <Switch
                      checked={selection.is_included}
                      onCheckedChange={(checked) =>
                        update(column.name, { is_included: checked })
                      }
                      aria-label={`Include ${column.name} in the analysis`}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* ------------------------------------------------------------ Grain */}
      {fields.available_grains.length > 1 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Compare periods by</p>
            <p className="text-xs text-muted-foreground">
              Determines how trends are grouped and which two periods are compared.
            </p>
          </div>
          <Select value={grain ?? undefined} onValueChange={(value) => setGrain(value as Grain)}>
            <SelectTrigger className="w-40" aria-label="Time period grouping">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {fields.available_grains.map((option) => (
                <SelectItem key={option} value={option}>
                  {option.charAt(0).toUpperCase() + option.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {/* ----------------------------------------------- What we can analyse */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
            We can analyse
          </p>
          <ul className="mt-2.5 space-y-1.5">
            {availableCapabilities.map(([key]) => (
              <li key={key} className="flex items-center gap-1.5 text-sm">
                <Check className="size-3.5 shrink-0 text-success" aria-hidden="true" />
                {key.replace(/_/g, " ")}
              </li>
            ))}
          </ul>
        </div>

        {blockedCapabilities.length ? (
          <div className="rounded-lg border border-border bg-surface p-4">
            <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
              Not available with this data
            </p>
            <ul className="mt-2.5 space-y-2">
              {blockedCapabilities.slice(0, 4).map(([key, capability]) => (
                <li key={key} className="text-sm">
                  <span className="font-medium">{key.replace(/_/g, " ")}</span>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {capability.reason}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="flex justify-end">
        <Button
          size="lg"
          loading={confirming}
          loadingText="Starting analysis…"
          onClick={() => onConfirm(Object.values(selections), grain)}
        >
          Confirm fields and analyse
        </Button>
      </div>
    </div>
  );
}
