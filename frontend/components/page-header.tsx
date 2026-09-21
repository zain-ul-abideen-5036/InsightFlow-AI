import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * The top of every application screen.
 *
 * Previously each page invented its own: some had a title and a sub-line, some
 * had actions inline with the title, some had metadata underneath, one had
 * nothing. Nested routes had no way back except the browser button.
 *
 * One component now owns the whole block — breadcrumb, title, lede, metadata,
 * actions — so the vertical rhythm at the top of the screen is identical
 * wherever you are, and so a route three levels deep cannot forget its trail.
 */
export function PageHeader({
  title,
  /** Rendered instead of `title` when the heading needs mixed emphasis. */
  titleNode,
  description,
  meta,
  actions,
  breadcrumbs,
  className,
  size = "default",
}: {
  title: string;
  titleNode?: React.ReactNode;
  description?: React.ReactNode;
  /** Quiet context under the lede: row counts, periods, last-run times. */
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumbs?: readonly Crumb[];
  className?: string;
  size?: "default" | "lg";
}) {
  return (
    <header className={cn("space-y-3", className)}>
      {breadcrumbs && breadcrumbs.length > 0 ? (
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            {breadcrumbs.map((crumb, index) => {
              const last = index === breadcrumbs.length - 1;
              return (
                <li key={`${crumb.label}-${index}`} className="flex items-center gap-1">
                  {index > 0 ? (
                    <ChevronRight
                      className="size-3 shrink-0 text-subtle-foreground/70"
                      aria-hidden="true"
                    />
                  ) : null}
                  {crumb.href && !last ? (
                    <Link
                      href={crumb.href}
                      className="rounded-sm transition-colors hover:text-foreground"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className={cn(last && "font-medium text-foreground")} aria-current={last ? "page" : undefined}>
                      {crumb.label}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 max-w-3xl space-y-1.5">
          <h1
            className={cn(
              "font-semibold tracking-tight text-balance",
              size === "lg" ? "text-3xl" : "text-2xl",
            )}
          >
            {titleNode ?? title}
          </h1>
          {description ? (
            <p className="text-md leading-relaxed text-muted-foreground text-pretty">
              {description}
            </p>
          ) : null}
        </div>

        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>

      {meta ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-subtle-foreground">
          {meta}
        </div>
      ) : null}
    </header>
  );
}

/**
 * A heading for a band within a page.
 *
 * `hint` carries the one line that explains what the section is for, which is
 * where most of the product's teaching happens — "an anomaly is a period that
 * falls outside what the rest of your data predicts" belongs here, not in a
 * tooltip nobody opens.
 */
export function SectionHeading({
  title,
  hint,
  count,
  action,
  id,
  className,
  as: Tag = "h2",
}: {
  title: string;
  hint?: React.ReactNode;
  count?: number;
  action?: React.ReactNode;
  id?: string;
  className?: string;
  as?: "h2" | "h3";
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-x-4 gap-y-1.5", className)}>
      <div className="min-w-0 space-y-0.5">
        <Tag id={id} className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          {title}
          {typeof count === "number" ? (
            <span className="tabular rounded-md bg-muted px-1.5 py-0.5 text-2xs font-medium text-muted-foreground">
              {count}
            </span>
          ) : null}
        </Tag>
        {hint ? (
          <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">{hint}</p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-1.5">{action}</div> : null}
    </div>
  );
}
