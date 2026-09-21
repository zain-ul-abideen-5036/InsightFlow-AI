"use client";

import * as React from "react";
import { Table2, LineChart as LineChartIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * Wrapper around every chart in the product.
 *
 * Two accessibility guarantees live here rather than being repeated (and
 * forgotten) at each call site:
 *
 * 1. A text summary describing what the chart shows, so the figure is not lost
 *    to anyone using a screen reader.
 * 2. A real data table behind a toggle. SVG charts are unreadable to assistive
 *    technology no matter how they are labelled; the table is the accessible
 *    equivalent, and sighted users reach for it too when they want exact values.
 */
export function ChartFrame({
  title,
  description,
  summary,
  columns,
  rows,
  children,
  actions,
  className,
  height = 280,
}: {
  title: string;
  description?: string;
  /** One sentence describing the shape of the data. Announced, not decorative. */
  summary: string;
  columns: string[];
  rows: (string | number)[][];
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  height?: number;
}) {
  const [showTable, setShowTable] = React.useState(false);
  const tableId = React.useId();

  return (
    <figure className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 space-y-0.5">
          <figcaption className="text-base font-semibold tracking-tight">{title}</figcaption>
          {description ? (
            <p className="text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {actions}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowTable((value) => !value)}
            aria-expanded={showTable}
            aria-controls={tableId}
          >
            {showTable ? <LineChartIcon aria-hidden="true" /> : <Table2 aria-hidden="true" />}
            {showTable ? "Chart" : "Data"}
          </Button>
        </div>
      </div>

      {/* The summary is always in the accessibility tree, even when the chart is shown. */}
      <p className="sr-only">{summary}</p>

      {showTable ? (
        <div id={tableId} className="overflow-hidden rounded-lg border border-border">
          <Table caption={`${title}. ${summary}`}>
            <TableHeader>
              <TableRow>
                {columns.map((column, index) => (
                  <TableHead key={column} numeric={index > 0}>
                    {column}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, rowIndex) => (
                <TableRow key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <TableCell key={cellIndex} numeric={cellIndex > 0}>
                      {cell}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div style={{ height }} aria-hidden="true">
          {children}
        </div>
      )}
    </figure>
  );
}
