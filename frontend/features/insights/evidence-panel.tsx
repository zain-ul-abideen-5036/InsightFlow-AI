"use client";

import * as React from "react";
import { Calculator, Columns3, Hash, Info } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn, formatValue } from "@/lib/utils";
import type { Evidence } from "@/types/api";

/**
 * The evidence behind a figure.
 *
 * This is the product's trust feature. Every claim InsightFlow makes can be
 * opened to reveal the exact value, the calculation that produced it, the
 * column it came from, the period it covers, and how many rows contributed.
 *
 * The `kind` badge is load-bearing: a measured fact and a statistical inference
 * are different kinds of claim, and collapsing that distinction is how an
 * analytics product starts misleading people.
 */

const KIND_LABEL: Record<string, string> = {
  observation: "Measured",
  statistical: "Calculated",
  correlation: "Moved together",
  comparison: "Compared",
  data_quality: "Data quality",
};

const KIND_VARIANT: Record<string, "neutral" | "info" | "warning"> = {
  observation: "neutral",
  statistical: "info",
  correlation: "warning",
  comparison: "neutral",
  data_quality: "warning",
};

export function EvidenceList({
  evidence,
  currency = "USD",
  className,
}: {
  evidence: Evidence[];
  currency?: string;
  className?: string;
}) {
  if (!evidence.length) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        No supporting figures were recorded for this.
      </p>
    );
  }

  return (
    <ul className={cn("space-y-2", className)}>
      {evidence.map((item, index) => (
        <li
          key={`${item.label}-${index}`}
          className="rounded-md border border-border bg-surface px-3.5 py-3"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="text-sm font-medium">{item.label}</span>
            <span className="tabular text-sm font-semibold">
              {typeof item.value === "number"
                ? formatValue(item.value, item.unit, currency, { precise: true })
                : (item.value ?? "—")}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-2xs text-muted-foreground">
            <Badge variant={KIND_VARIANT[item.kind] ?? "neutral"}>
              {KIND_LABEL[item.kind] ?? item.kind}
            </Badge>
            {item.calculation ? (
              <span className="inline-flex items-center gap-1">
                <Calculator className="size-3" aria-hidden="true" />
                {item.calculation}
              </span>
            ) : null}
            {item.column ? (
              <span className="inline-flex items-center gap-1">
                <Columns3 className="size-3" aria-hidden="true" />
                {item.column}
              </span>
            ) : null}
            {item.period ? (
              <span className="inline-flex items-center gap-1">
                <Info className="size-3" aria-hidden="true" />
                {item.period}
              </span>
            ) : null}
            {item.row_count ? (
              <span className="inline-flex items-center gap-1">
                <Hash className="size-3" aria-hidden="true" />
                {item.row_count.toLocaleString()} rows
              </span>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** A denser table form, used inside reports and the evidence dialog. */
export function EvidenceTable({
  evidence,
  currency = "USD",
}: {
  evidence: Evidence[];
  currency?: string;
}) {
  return (
    <Table caption="Supporting figures, with the calculation used for each">
      <TableHeader>
        <TableRow>
          <TableHead>Figure</TableHead>
          <TableHead numeric>Value</TableHead>
          <TableHead>How it was calculated</TableHead>
          <TableHead>Period</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {evidence.map((item, index) => (
          <TableRow key={`${item.label}-${index}`}>
            <TableCell className="font-medium">{item.label}</TableCell>
            <TableCell numeric>
              {typeof item.value === "number"
                ? formatValue(item.value, item.unit, currency, { precise: true })
                : (item.value ?? "—")}
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {item.calculation || "—"}
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">{item.period || "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
