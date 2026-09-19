"use client";

import { formatValue } from "@/lib/utils";

interface TooltipPayloadItem {
  name?: string;
  value?: number;
  color?: string;
  dataKey?: string | number;
}

/** Shared Recharts tooltip so every chart reads identically. */
export function ChartTooltip({
  active,
  payload,
  label,
  unit = "number",
  currency = "USD",
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
  unit?: string;
  currency?: string;
}) {
  if (!active || !payload?.length) return null;

  const visible = payload.filter((item) => item.value !== undefined && item.value !== null);
  if (!visible.length) return null;

  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 shadow-popover">
      {label ? <p className="mb-1 text-xs font-medium text-foreground">{label}</p> : null}
      <div className="space-y-0.5">
        {visible.map((item, index) => (
          <div key={index} className="flex items-center gap-2 text-xs">
            <span
              className="size-2 shrink-0 rounded-[2px]"
              style={{ backgroundColor: item.color }}
              aria-hidden="true"
            />
            <span className="text-muted-foreground">{item.name}</span>
            <span className="tabular ml-auto font-medium text-foreground">
              {formatValue(item.value ?? null, unit, currency)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
