"use client";

import * as React from "react";
import { AlertTriangle, CalendarRange, Columns3, Copy, Rows3 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/utils";
import type { DatasetDetail } from "@/types/api";

/**
 * What we read from the uploaded file, shown before anything is analysed.
 *
 * The point is reassurance through specificity: the user sees their own rows,
 * the row and column counts, the date range we found, and every problem we
 * noticed — before committing to an analysis.
 */
export function DatasetPreview({ dataset }: { dataset: DatasetDetail }) {
  const profile = dataset.profile;
  const columns = React.useMemo(
    () => (dataset.preview_rows[0] ? Object.keys(dataset.preview_rows[0]) : []),
    [dataset.preview_rows],
  );

  const stats = [
    { icon: Rows3, label: "Rows", value: dataset.row_count.toLocaleString() },
    { icon: Columns3, label: "Columns", value: dataset.column_count.toLocaleString() },
    {
      icon: CalendarRange,
      label: "Date range",
      value:
        profile.date_min && profile.date_max
          ? `${formatDate(profile.date_min)} — ${formatDate(profile.date_max)}`
          : "No dates detected",
    },
    {
      icon: Copy,
      label: "Duplicate rows",
      value: dataset.duplicate_row_count.toLocaleString(),
    },
  ];

  const seriousIssues = profile.quality_issues.filter(
    (issue) => issue.severity === "high" || issue.severity === "medium",
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(({ icon: Icon, label, value }) => (
          <div key={label} className="rounded-xl border border-border bg-card p-4 shadow-e1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Icon className="size-3.5" aria-hidden="true" />
              <span className="eyebrow">{label}</span>
            </div>
            <p className="mt-1.5 text-base font-semibold">{value}</p>
          </div>
        ))}
      </div>

      {seriousIssues.length ? (
        <div className="space-y-2 rounded-xl border border-warning-border bg-warning-subtle px-4 py-3.5">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden="true" />
            <p className="text-sm font-medium">
              {seriousIssues.length} thing{seriousIssues.length === 1 ? "" : "s"} worth knowing
            </p>
          </div>
          <ul className="space-y-1.5 pl-6">
            {seriousIssues.slice(0, 4).map((issue) => (
              <li key={issue.title} className="text-xs leading-relaxed text-muted-foreground">
                <span className="font-medium text-foreground">{issue.title}.</span>{" "}
                {issue.detail}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-e1">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">First {dataset.preview_rows.length} rows</p>
          <Badge variant="neutral">{dataset.original_filename}</Badge>
        </div>
        <Table caption={`Preview of the first rows of ${dataset.original_filename}`}>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead key={column} className="whitespace-nowrap">
                  {column}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {dataset.preview_rows.slice(0, 10).map((row, index) => (
              <TableRow key={index}>
                {columns.map((column) => {
                  const value = row[column];
                  return (
                    <TableCell key={column} className="max-w-[220px] truncate whitespace-nowrap">
                      {value === null || value === undefined ? (
                        <span className="text-muted-foreground/60">—</span>
                      ) : (
                        String(value)
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
