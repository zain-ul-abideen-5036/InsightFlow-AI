import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CornerDownRight,
  FileSpreadsheet,
  Lock,
  PlayCircle,
  Sparkles,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MARK_GEOMETRY } from "@/components/logo";
import { DashboardPreview } from "@/app/(marketing)/dashboard-preview";
import { cn } from "@/lib/utils";

/**
 * The landing page.
 *
 * An editorial layout rather than a template one. Headlines are set in a
 * display serif with an italic accent; every section opens with a mono index
 * ("01 · The problem"); and no two consecutive bands share a silhouette —
 * a split hero, a ledger of figures, a sticky argument, a numbered track, a
 * bento of real product fragments, a dark pipeline, an index of questions,
 * and a closing panel drawn from the logo's own geometry.
 *
 * Every figure on the page comes from the NovaMart sample dataset, the same
 * values a visitor sees in the demo. A premium page built on invented numbers
 * would contradict the one thing this product argues.
 */
export default function LandingPage() {
  return (
    <>
      <Hero />
      <Ledger />
      <Problem />
      <HowItWorks />
      <Features />
      <Evidence />
      <UseCases />
      <Security />
      <Faq />
      <ClosingCta />
    </>
  );
}

/* ================================================================== Hero */

function Hero() {
  return (
    <section className="hero-surface relative overflow-hidden">
      <div className="hero-grid pointer-events-none absolute inset-0" aria-hidden="true" />

      <div className="container relative pt-14 sm:pt-20 lg:pt-24">
        {/* An editorial split: the headline owns the left, the argument and
            the actions sit on the right, aligned to the headline's baseline. */}
        <div className="grid items-end gap-x-12 gap-y-9 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <p className="enter kicker" style={{ "--enter-index": 0 } as React.CSSProperties}>
              Business analytics, with receipts
            </p>
            <h1
              className="enter display mt-6 text-[3.4rem] sm:text-[5rem] lg:text-[6.25rem]"
              style={{ "--enter-index": 1 } as React.CSSProperties}
            >
              Understand your business.{" "}
              <em className="text-primary">Act on the data.</em>
            </h1>
          </div>

          <div
            className="enter lg:col-span-5 lg:pb-3"
            style={{ "--enter-index": 2 } as React.CSSProperties}
          >
            <p className="max-w-md text-lg leading-relaxed text-muted-foreground">
              Upload your business data, discover what changed, investigate why it
              changed, and ask questions answered with evidence from your own figures.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button size="xl" asChild className="group rounded-full px-7">
                <Link href="/signup">
                  Analyse your data
                  <ArrowRight
                    className="transition-transform duration-base ease-out group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </Link>
              </Button>
              <Button size="xl" variant="outline" asChild className="rounded-full px-7">
                <Link href="/demo">
                  <PlayCircle aria-hidden="true" />
                  See how it works
                </Link>
              </Button>
            </div>

            <p className="mt-5 flex items-center gap-2 text-sm text-subtle-foreground">
              <FileSpreadsheet className="size-4" aria-hidden="true" />
              CSV and Excel. The demo needs no account and no file.
            </p>
          </div>
        </div>

        {/* The product shot, framed like an object on a table: a bezel, a soft
            accent bloom behind it, and two annotations that point at what
            makes the numbers trustworthy. */}
        <div
          className="enter relative mx-auto mt-16 max-w-[68rem] sm:mt-20"
          style={{ "--enter-index": 3 } as React.CSSProperties}
        >
          <div
            aria-hidden="true"
            className="absolute -inset-x-10 -top-10 bottom-10 rounded-[3rem] bg-primary/[0.09] blur-3xl"
          />
          <div className="relative rounded-[1.4rem] border border-border/80 bg-card/60 p-1.5 shadow-showcase backdrop-blur sm:p-2">
            <DashboardPreview className="shadow-none" />
          </div>

          <Annotation
            className="left-0 top-[30%] -translate-x-[62%]"
            label="Computed, not generated"
            detail="sum(revenue) · Aug 2026 · 980 rows"
          />
          <Annotation
            className="bottom-[34%] right-0 translate-x-[58%]"
            label="Ranked by contribution"
            detail="Nova Air Purifier · 62% of the change"
          />
        </div>
      </div>

      {/* The shot's lower edge fades into the next band instead of ending on
          a hard line. */}
      <div
        className="pointer-events-none relative -mt-28 h-28 bg-gradient-to-b from-transparent to-background"
        aria-hidden="true"
      />
    </section>
  );
}

function Annotation({
  className,
  label,
  detail,
}: {
  className?: string;
  label: string;
  detail: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "absolute z-10 hidden w-64 rounded-xl border border-border bg-card/90 p-3 shadow-overlay backdrop-blur-md xl:block",
        className,
      )}
    >
      <p className="flex items-center gap-1.5 text-xs font-semibold">
        <span className="flex size-4 items-center justify-center rounded-full bg-success-subtle text-success">
          <Check className="size-2.5" strokeWidth={3} />
        </span>
        {label}
      </p>
      <p className="mt-1.5 font-mono text-[10.5px] leading-relaxed text-muted-foreground">
        {detail}
      </p>
    </div>
  );
}

/* ================================================================ Ledger */

/**
 * Four figures about the product itself, each one a claim the code enforces.
 * Deliberately not customer logos or testimonials: this product has no
 * customers yet, and inventing social proof would undermine everything else.
 */
function Ledger() {
  const items = [
    { value: "0", label: "figures written by the language model" },
    { value: "0", label: "rows of your file sent to the AI" },
    { value: "3", label: "anomaly methods, each used only where it fits" },
    { value: "1", label: "click from any figure to its evidence" },
  ];

  return (
    <section id="product" aria-label="InsightFlow in figures" className="relative pt-10">
      <div className="container">
        <dl className="reveal grid grid-cols-2 border-y border-border lg:grid-cols-4">
          {items.map(({ value, label }, index) => (
            <div
              key={label}
              className={cn(
                "flex flex-col gap-2 px-2 py-8 sm:px-6 sm:py-10",
                index % 2 === 1 && "border-l border-border",
                index >= 2 && "border-t border-border lg:border-t-0",
                index === 2 && "lg:border-l",
              )}
            >
              <dt className="order-2 max-w-[13rem] text-sm leading-snug text-muted-foreground">
                {label}
              </dt>
              <dd className="display tabular order-1 text-6xl sm:text-7xl">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/* =============================================================== Problem */

function Problem() {
  const failures = [
    {
      title: "The spreadsheet answers one question at a time",
      body: "Every follow-up — which product, which region, which week — is another pivot table, and the trail of what you checked disappears when you close the file.",
    },
    {
      title: "The dashboard shows what, never why",
      body: "A line going down is a prompt, not an answer. Somebody still has to work out which segment moved and what happened at the same time.",
    },
    {
      title: "The chatbot sounds certain and cannot add up",
      body: "Paste a spreadsheet into a language model and you get confident arithmetic you cannot check, on data that has left your machine.",
    },
  ];

  return (
    <section id="problem" className="py-24 sm:py-32">
      <div className="container">
        <div className="grid gap-x-16 gap-y-14 lg:grid-cols-12">
          <div className="lg:sticky lg:top-32 lg:col-span-5 lg:self-start">
            <p className="kicker">01 · The problem</p>
            <h2 className="display mt-6 text-5xl sm:text-6xl">
              You can see that something changed.{" "}
              <em className="text-muted-foreground">Finding out what takes a week.</em>
            </h2>
            <p className="mt-7 max-w-md text-md leading-relaxed text-muted-foreground">
              The numbers exist. Getting from &ldquo;revenue is down&rdquo; to &ldquo;here is
              what moved, and here is what to do&rdquo; is the part that never happens.
            </p>
          </div>

          <div className="lg:col-span-7">
            <ol className="border-t border-border">
              {failures.map(({ title, body }, index) => (
                <li
                  key={title}
                  className="reveal grid gap-x-8 gap-y-3 border-b border-border py-9 sm:grid-cols-[5rem_1fr]"
                >
                  <span
                    className="display tabular text-5xl text-subtle-foreground/60"
                    aria-hidden="true"
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3 className="text-xl font-semibold tracking-tight">{title}</h3>
                    <p className="mt-2.5 max-w-prose leading-relaxed text-muted-foreground">
                      {body}
                    </p>
                  </div>
                </li>
              ))}
            </ol>

            <figure className="reveal mt-12 rounded-2xl bg-surface-sunken p-8 sm:p-10">
              <blockquote className="display text-3xl sm:text-4xl">
                InsightFlow does the analysis the way an analyst would, shows you the
                working, <em className="text-primary">and tells you what it cannot establish.</em>
              </blockquote>
            </figure>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ========================================================== How it works */

function HowItWorks() {
  const steps = [
    {
      title: "Upload your data",
      body: "CSV or Excel. We read it, work out what each column means, and show you what we found before anything runs.",
      output: "CSV · TSV · XLSX",
    },
    {
      title: "InsightFlow understands the dataset",
      body: "Metrics, trends, segments and anomalies — computed in the engine, only where your columns actually support them.",
      output: "trends · segments · anomalies",
    },
    {
      title: "Explore metrics and insights",
      body: "What moved, by how much, and how much of the total change each part of the business accounts for.",
      output: "contribution to change, ranked",
    },
    {
      title: "Ask questions and investigate",
      body: "Drill into any finding, open the evidence behind it, and ask follow-ups in plain English.",
      output: "answers with evidence attached",
    },
  ];

  return (
    <section id="how-it-works" className="relative overflow-hidden bg-surface-sunken py-24 sm:py-32">
      <div className="container">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <p className="kicker">02 · How it works</p>
            <h2 className="display mt-6 text-5xl sm:text-6xl">
              From a spreadsheet <em>to a decision.</em>
            </h2>
          </div>
          <p className="max-w-sm leading-relaxed text-muted-foreground">
            Four steps, in order. Nothing runs until you have seen what we understood
            about your file.
          </p>
        </div>

        {/* A track with a node per step. On wide screens it reads left to
            right; on narrow ones it becomes a vertical rail. */}
        <ol className="relative mt-16 grid gap-10 md:grid-cols-4 md:gap-6">
          <div
            aria-hidden="true"
            className="absolute bottom-0 left-[11px] top-2 w-px bg-border-strong md:bottom-auto md:left-0 md:right-0 md:top-[11px] md:h-px md:w-auto"
          />
          {steps.map((step, index) => (
            <li key={step.title} className="reveal relative pl-10 md:pl-0">
              <span
                aria-hidden="true"
                className="absolute left-0 top-0.5 flex size-[23px] items-center justify-center rounded-full border border-border-strong bg-background md:static"
              >
                <span className="size-2 rounded-full bg-primary" />
              </span>
              <p className="tabular mt-0 font-mono text-xs text-subtle-foreground md:mt-7">
                Step {String(index + 1).padStart(2, "0")}
              </p>
              <h3 className="mt-2 text-lg font-semibold tracking-tight">{step.title}</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
                {step.body}
              </p>
              <p className="mt-5 inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 font-mono text-[11px] text-muted-foreground shadow-e0">
                <CornerDownRight className="size-3 text-primary" aria-hidden="true" />
                {step.output}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ============================================================== Features */

function Features() {
  return (
    <section id="features" className="py-24 sm:py-32">
      <div className="container">
        <div className="grid gap-6 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-7">
            <p className="kicker">03 · The product</p>
            <h2 className="display mt-6 text-5xl sm:text-6xl">
              An analytics engine, <em className="text-primary">with an AI that explains it.</em>
            </h2>
          </div>
          <p className="leading-relaxed text-muted-foreground lg:col-span-5">
            Every number is computed from your data by a deterministic engine. The AI
            layer puts those numbers into plain English — it never produces them.
          </p>
        </div>

        {/* A bento of real fragments of the product, in three rows whose
            splits differ (4/2, 2/4, 3/3) so the grid never settles into the
            three-equal-cards rhythm. */}
        <div className="mt-16 grid gap-4 md:grid-cols-6">
          <Tile
            className="md:col-span-4"
            title="Anomaly detection"
            body="Rolling statistics, interquartile ranges, and isolation forests, each applied where it fits rather than everywhere."
          >
            <AnomalyVisual />
          </Tile>

          <Tile
            className="md:col-span-2"
            title="Evidence on every claim"
            body="Each figure carries the calculation, the column, the period, and the row count behind it."
          >
            <dl className="space-y-2 rounded-xl border border-border bg-surface-sunken p-4 font-mono text-[11px]">
              {[
                ["value", "$193,032.93"],
                ["calc", "sum(revenue)"],
                ["period", "Aug 2026"],
                ["rows", "980"],
              ].map(([key, value]) => (
                <div key={key} className="flex items-center justify-between gap-3">
                  <dt className="text-subtle-foreground">{key}</dt>
                  <dd className="tabular font-medium text-foreground">{value}</dd>
                </div>
              ))}
            </dl>
          </Tile>

          <Tile
            className="md:col-span-2"
            title="Business questions"
            body="Ask why revenue declined. Get an answer backed by figures you can open and inspect."
          >
            <div className="space-y-2.5">
              <p className="ml-auto w-fit max-w-[90%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-sm text-primary-foreground">
                Why did revenue change last month?
              </p>
              <div className="w-fit max-w-[92%] rounded-2xl rounded-bl-md border border-border bg-card px-3.5 py-2.5 shadow-e1">
                <p className="text-sm font-semibold">August revenue declined 13.9%</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  3 supporting figures · View evidence
                </p>
              </div>
            </div>
          </Tile>

          <Tile
            className="md:col-span-4"
            title="AI investigation"
            body="When something moves, see which products, regions, or channels account for it — and what coincided with it."
          >
            <div className="space-y-4">
              <ContributionBar label="Nova Air Purifier" value="−$19,193" share={62} emphasis />
              <ContributionBar label="Every other product" value="−$11,850" share={38} />
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="size-1.5 rounded-full bg-warning" aria-hidden="true" />
                Coincides with 7 days of zero available inventory
              </p>
            </div>
          </Tile>

          <Tile
            className="md:col-span-3"
            title="Automated analytics"
            body="Revenue, orders, customers and average order value — calculated only where your data actually supports them."
          >
            <div className="grid grid-cols-2 gap-2">
              {[
                ["Revenue", "$193K"],
                ["Orders", "980"],
                ["Customers", "692"],
                ["Avg order", "$196.97"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-border bg-surface-sunken px-3 py-2.5">
                  <p className="text-[11px] text-subtle-foreground">{label}</p>
                  <p className="tabular mt-0.5 text-lg font-semibold tracking-tight">{value}</p>
                </div>
              ))}
            </div>
          </Tile>

          <Tile
            className="md:col-span-3"
            title="Performance reports"
            body="A shareable report with the executive summary, key figures, trends, and what deserves attention."
          >
            <div className="relative h-[124px] overflow-hidden">
              <div className="absolute inset-x-6 top-3 h-full rounded-t-xl border border-border bg-card/60" />
              <div className="absolute inset-x-0 top-0 h-full rounded-t-xl border border-border bg-card p-4 shadow-e2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-subtle-foreground">
                  August 2026 · Performance report
                </p>
                <p className="display mt-2 text-2xl">Revenue fell 13.9%</p>
                <div className="mt-3 space-y-1.5">
                  <div className="h-1.5 w-11/12 rounded-full bg-muted" />
                  <div className="h-1.5 w-4/5 rounded-full bg-muted" />
                  <div className="h-1.5 w-2/3 rounded-full bg-muted" />
                </div>
              </div>
            </div>
          </Tile>
        </div>
      </div>
    </section>
  );
}

function Tile({
  className,
  title,
  body,
  children,
}: {
  className?: string;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <article
      className={cn(
        "reveal group flex flex-col justify-between gap-8 overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-e1 transition-[box-shadow,border-color] duration-slow ease-out hover:border-border-strong hover:shadow-e3 sm:p-7",
        className,
      )}
    >
      <div aria-hidden="true">{children}</div>
      <div>
        <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
        <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">{body}</p>
      </div>
    </article>
  );
}

function ContributionBar({
  label,
  value,
  share,
  emphasis = false,
}: {
  label: string;
  value: string;
  share: number;
  emphasis?: boolean;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className={cn(emphasis ? "font-semibold" : "text-muted-foreground")}>{label}</span>
        <span className="tabular font-mono text-xs text-muted-foreground">
          {value} · {share}%
        </span>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full", emphasis ? "bg-primary" : "bg-border-strong")}
          style={{ width: `${share}%` }}
        />
      </div>
    </div>
  );
}

/** A series with its expected band and the one point that left it. */
function AnomalyVisual() {
  const series = [44, 47, 42, 50, 46, 52, 48, 55, 51, 49, 94, 53, 50, 56, 52, 58, 54, 57, 55, 60];
  const width = 600;
  const height = 150;
  const x = (index: number) => (index / (series.length - 1)) * width;
  const y = (value: number) => height - 14 - ((value - 36) / 64) * (height - 28);
  const line = series.map((value, index) => `${x(index)},${y(value)}`).join(" ");
  const upper = series.map((value, index) => `${x(index)},${y(Math.min(value, 60) + 9)}`);
  const lower = series.map((value, index) => `${x(index)},${y(Math.min(value, 60) - 9)}`).reverse();
  const spike = series.indexOf(94);

  return (
    <div className="relative">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-danger-subtle px-2 py-0.5 text-xs font-semibold text-danger">
          Anomaly
        </span>
        <span className="text-sm font-medium">Units sold · 14 Mar 2026</span>
        <span className="tabular font-mono text-xs text-muted-foreground">
          161 against an expected 61
        </span>
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-36 w-full" preserveAspectRatio="none" fill="none">
          <polygon points={[...upper, ...lower].join(" ")} fill="hsl(var(--chart-1) / 0.08)" />
          <polyline
            points={line}
            stroke="hsl(var(--chart-1))"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={x(spike)}
            x2={x(spike)}
            y1={y(94)}
            y2={height}
            stroke="hsl(var(--danger))"
            strokeDasharray="3 4"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {/* Drawn in HTML so it stays round under the stretched viewBox. */}
        <span
          className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-danger shadow-e1"
          style={{
            left: `${(spike / (series.length - 1)) * 100}%`,
            top: `${(y(94) / height) * 100}%`,
          }}
        />
      </div>
    </div>
  );
}

/* ============================================================== Evidence */

function Evidence() {
  const pipeline = [
    { step: "Your file", note: "rows stay here" },
    { step: "Engine", note: "computes every figure" },
    { step: "Evidence bundle", note: "aggregates and labels" },
    { step: "Language model", note: "phrases what was found" },
    { step: "Verifier", note: "drops unsupported claims" },
  ];

  return (
    <section
      id="evidence"
      className="relative overflow-hidden bg-inverse py-24 text-inverse-foreground sm:py-32"
    >
      <div className="dot-field pointer-events-none absolute inset-0" aria-hidden="true" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 50% 55% at 85% 0%, hsl(var(--primary) / 0.28), transparent 65%)",
        }}
      />

      <div className="container relative">
        <div className="max-w-4xl">
          <p className="kicker text-inverse-muted before:bg-inverse-border">
            04 · Why this is not an AI wrapper
          </p>
          <h2 className="display mt-6 text-5xl sm:text-7xl">
            AI explains your data.{" "}
            <em className="text-inverse-muted">It doesn&rsquo;t invent it.</em>
          </h2>
          <p className="mt-7 max-w-2xl text-md leading-relaxed text-inverse-muted">
            Language models cannot reliably add up thousands of rows, and a confident wrong
            number is worse than no number. So InsightFlow computes every figure first, then
            asks the model to phrase what was found.
          </p>
        </div>

        {/* The pipeline, drawn as it runs. The model sits fourth — after the
            numbers already exist — which is the entire argument. */}
        <ol className="reveal mt-16 grid gap-px overflow-hidden rounded-2xl border border-inverse-border bg-inverse-border sm:grid-cols-5">
          {pipeline.map(({ step, note }, index) => (
            <li
              key={step}
              className="relative bg-inverse px-5 py-6"
            >
              {index === 3 ? (
                <span aria-hidden="true" className="absolute inset-0 bg-primary/15" />
              ) : null}
              <p className="tabular relative font-mono text-[11px] text-inverse-muted">
                {String(index + 1).padStart(2, "0")}
              </p>
              <p className="relative mt-3 font-semibold">{step}</p>
              <p className="relative mt-1 text-sm text-inverse-muted">{note}</p>
              {index < pipeline.length - 1 ? (
                <ArrowRight
                  aria-hidden="true"
                  className="absolute right-3 top-6 hidden size-3.5 text-inverse-muted sm:block"
                />
              ) : null}
            </li>
          ))}
        </ol>

        <div className="mt-14 grid items-start gap-12 lg:grid-cols-[1fr_1.15fr]">
          <ul className="divide-y divide-inverse-border border-y border-inverse-border">
            {[
              {
                title: "Deterministic analytics calculates the numbers",
                body: "Totals, growth rates, contributions, anomaly bounds and segment breakdowns are computed in pandas and tested against known-answer fixtures.",
              },
              {
                title: "The AI only explains what was found",
                body: "It receives a compact evidence bundle — aggregates and labels, never the rows of your file.",
              },
              {
                title: "Evidence is shown with every answer",
                body: "Each figure carries its calculation, its column, its period, and how many rows contributed.",
              },
              {
                title: "Unsupported claims are discarded",
                body: "A response citing a figure the analysis never produced is thrown away rather than shown to you. Coincidence is reported as coincidence, never as a cause.",
              },
            ].map(({ title, body }) => (
              <li key={title} className="reveal flex gap-4 py-6">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary">
                  <Check className="size-3" strokeWidth={3} aria-hidden="true" />
                </span>
                <div>
                  <h3 className="font-semibold">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-inverse-muted">{body}</p>
                </div>
              </li>
            ))}
          </ul>

          {/* A real answer, rendered the way the product renders one. */}
          <div className="reveal relative">
            <div
              aria-hidden="true"
              className="absolute -inset-4 rounded-[2rem] bg-primary/20 blur-3xl"
            />
            <div className="relative overflow-hidden rounded-3xl border border-inverse-border bg-inverse shadow-overlay">
              <div className="flex items-center justify-between gap-3 border-b border-inverse-border px-6 py-4">
                <p className="flex items-center gap-2 text-xs font-medium text-inverse-muted">
                  <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
                  Why did revenue change last month?
                </p>
                <Badge variant="on-inverse">Answer</Badge>
              </div>

              <div className="px-6 pt-6">
                <h3 className="display text-4xl">August revenue declined 13.9%</h3>
              </div>

              <dl className="mx-6 mt-6 grid grid-cols-3 divide-x divide-inverse-border rounded-xl border border-inverse-border">
                {[
                  { label: "Revenue, Aug 2026", value: "$193,033" },
                  { label: "Revenue, Jul 2026", value: "$224,076" },
                  { label: "Change", value: "−13.9%" },
                ].map(({ label, value }) => (
                  <div key={label} className="min-w-0 px-2.5 py-3 sm:px-3.5">
                    <dt className="truncate text-2xs text-inverse-muted">{label}</dt>
                    <dd className="tabular mt-1 text-base font-semibold sm:text-lg">{value}</dd>
                  </div>
                ))}
              </dl>

              <div className="space-y-4 px-6 py-6 text-sm">
                <div>
                  <p className="text-2xs font-semibold uppercase tracking-[0.09em] text-inverse-muted">
                    What the data shows
                  </p>
                  <p className="mt-1.5 leading-relaxed text-inverse-foreground/90">
                    Nova Air Purifier fell by USD 19,193, which is 62% of the total change.
                    Inventory records show zero available units on 7 days in this period.
                  </p>
                </div>

                <div className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3">
                  <p className="text-2xs font-semibold text-warning">
                    Possible explanation{" "}
                    <span className="font-normal text-inverse-muted">
                      — consistent with the data, not established by it
                    </span>
                  </p>
                  <p className="mt-1.5 leading-relaxed text-inverse-foreground/85">
                    The stockout coincides with the decline. The data is consistent with an
                    inventory shortage, though it cannot confirm it as the cause.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-inverse-border px-6 py-3.5">
                <Badge variant="on-inverse">Confidence: moderate</Badge>
                <span className="text-2xs text-inverse-muted">From the NovaMart sample dataset</span>
              </div>
            </div>
          </div>
        </div>

        <p className="mt-16 text-center text-lg">
          Turn the AI off entirely and the product still works.{" "}
          <span className="text-inverse-muted">The whole test suite runs that way.</span>
        </p>
      </div>
    </section>
  );
}

/* ============================================================= Use cases */

function UseCases() {
  const cases = [
    {
      title: "Online retail",
      question: "Why did last month fall short?",
      body: "An order export becomes revenue, margin, and average order value by product, category, and region — with the segments that moved ranked by how much of the change they account for.",
    },
    {
      title: "Subscriptions",
      question: "Which plan is quietly shrinking?",
      body: "Monthly revenue by plan and cohort, with the trend separated from the noise, so a slow decline is visible before it shows up in the total.",
    },
    {
      title: "Hospitality",
      question: "Which days actually make money?",
      body: "Covers, spend per head, and discounting by day of week and site, with weekly seasonality reported only where there is enough history to justify the claim.",
    },
    {
      title: "Operations",
      question: "Did a stockout cost us sales?",
      body: "Zero-availability days are lined up against the sales that fell, and reported as a coincidence with a stated confidence — never as a proven cause.",
    },
    {
      title: "Customers",
      question: "Are we growing, or churning quietly?",
      body: "New against returning revenue, concentration risk, and revenue per customer — computed only when the file actually carries a customer identifier.",
    },
    {
      title: "Reporting",
      question: "What do I send the board?",
      body: "A performance report with the executive summary, key figures, trends, and what deserves attention, with figures fixed at generation time so they never move under you.",
    },
  ];

  return (
    <section id="use-cases" className="py-24 sm:py-32">
      <div className="container">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <p className="kicker">05 · What people bring it</p>
            <h2 className="display mt-6 text-5xl sm:text-6xl">
              Any export with a date, <em>an amount, and a question.</em>
            </h2>
          </div>
          <p className="max-w-sm leading-relaxed text-muted-foreground">
            The engine reports the metrics your columns support and states plainly which
            ones they do not.
          </p>
        </div>

        {/* An index, not a card grid: the questions are the content, so they
            are set large and read down the page like a table of contents. */}
        <ul className="mt-16 border-t border-border">
          {cases.map(({ title, question, body }, index) => (
            <li
              key={title}
              className="reveal grid gap-x-10 gap-y-3 border-b border-border py-8 md:grid-cols-12 md:items-baseline"
            >
              <p className="flex items-baseline gap-3 md:col-span-3">
                <span className="tabular font-mono text-xs text-subtle-foreground">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="text-sm font-semibold">{title}</span>
              </p>
              <h3 className="display text-3xl sm:text-4xl md:col-span-5">{question}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground md:col-span-4">
                {body}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ============================================================== Security */

function Security() {
  const controls = [
    {
      title: "Aggregates, not rows",
      body: "The AI layer receives computed metrics and segment names — never the rows of your file.",
    },
    {
      title: "Run the model locally",
      body: "The default development setup uses a local model, so nothing leaves your machine at all.",
    },
    {
      title: "Isolated by workspace",
      body: "Access is enforced in the backend on every request, not just in the interface.",
    },
    {
      title: "You can see what is sent",
      body: "Settings shows the active AI provider and exactly what is transmitted to it.",
    },
  ];

  return (
    <section id="security" className="bg-surface-sunken py-24 sm:py-32">
      <div className="container">
        <div className="grid gap-x-16 gap-y-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <p className="kicker">06 · Security</p>
            <div className="mt-8 flex size-14 items-center justify-center rounded-2xl border border-border bg-card text-primary shadow-e2">
              <Lock className="size-6" aria-hidden="true" />
            </div>
            <h2 className="display mt-8 text-5xl sm:text-6xl">
              Your business data <em className="text-primary">stays yours.</em>
            </h2>
            {/* An honest statement of what we have not done is itself a trust signal. */}
            <p className="mt-7 max-w-md text-sm leading-relaxed text-subtle-foreground">
              InsightFlow AI does not hold SOC 2, ISO 27001, HIPAA, or GDPR certification. We
              describe the controls that exist rather than claiming ones that do not.
            </p>
          </div>

          <ul className="grid gap-px self-end overflow-hidden rounded-3xl border border-border bg-border sm:grid-cols-2 lg:col-span-7">
            {controls.map(({ title, body }, index) => (
              <li key={title} className="reveal bg-card p-8">
                <p className="tabular font-mono text-xs text-subtle-foreground">
                  {String(index + 1).padStart(2, "0")}
                </p>
                <h3 className="mt-5 text-lg font-semibold tracking-tight">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* =================================================================== FAQ */

function Faq() {
  const questions = [
    {
      q: "What file do I need?",
      a: "A CSV, TSV, or Excel export with one row per order or transaction. It needs a date and an amount; everything else is optional and adds detail. We handle the usual export problems — title rows above the headers, duplicate column names, currency symbols, mixed date formats, and unusual encodings — and tell you plainly when something cannot be read.",
    },
    {
      q: "Does the AI calculate the numbers?",
      a: "No, and this is the most important thing about the product. Every figure is computed in Python by a deterministic engine that is tested against datasets with hand-verified answers. The model receives those computed findings and writes them up. Anything it produces is then checked back against them, and a response citing a figure the analysis never produced is discarded rather than shown to you.",
    },
    {
      q: "What data is sent to the AI provider?",
      a: "Aggregated metrics, segment names such as product and region labels, period labels, the calculation used for each figure, and your question. Individual rows of your file are never sent. With the default local model nothing leaves the machine at all, and the Settings page shows the active provider and exactly what is transmitted to it.",
    },
    {
      q: "What happens if the AI is unavailable?",
      a: "The product keeps working. Analysis, metrics, trends, anomalies, investigations, and reports are all produced without a model; the explanations are written by the engine instead, in plainer prose. The entire test suite runs this way, which is how we know the claim holds.",
    },
    {
      q: "Will it tell me what caused a decline?",
      a: "It will tell you what changed, where, by how much, and what else moved at the same time — and it will label that as coincidence, because co-occurrence is what the data establishes. If sales fell during days when inventory read zero, it reports both facts, says they coincide, and gives you a confidence level. It will not tell you one caused the other, because your spreadsheet cannot show that.",
    },
    {
      q: "Can I check where a number came from?",
      a: "Every insight, anomaly, and answer carries a View evidence control. Opening it shows the underlying figure, the column it came from, the period, the row count, and the named calculation that produced it.",
    },
    {
      q: "Is my data private?",
      a: "Each workspace is isolated, and access is enforced in the backend on every request rather than hidden in the interface. You can delete a dataset and its analyses at any time, and the files go with it. We make no compliance certification claims: InsightFlow AI holds no SOC 2, ISO 27001, HIPAA, or GDPR certification, and says so rather than implying otherwise.",
    },
    {
      q: "How long does an analysis take?",
      a: "Seconds for a typical export — the dashboard shows the real stages as they complete rather than an invented percentage. Written explanations take longer when a model runs locally on a CPU, so the evidence is shown as soon as it exists and the prose arrives when it is ready.",
    },
  ];

  return (
    <section id="faq" className="py-24 sm:py-32">
      <div className="container">
        <div className="grid gap-x-16 gap-y-12 lg:grid-cols-12">
          <div className="lg:sticky lg:top-32 lg:col-span-4 lg:self-start">
            <p className="kicker">07 · Questions</p>
            <h2 className="display mt-6 text-5xl sm:text-6xl">
              Worth asking <em>first.</em>
            </h2>
            <Link
              href="/demo"
              className="group mt-8 inline-flex items-center gap-1.5 text-sm font-medium text-primary"
            >
              Or open the demo and see for yourself
              <ArrowUpRight
                className="size-4 transition-transform duration-base ease-out group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
          </div>

          <dl className="border-t border-border lg:col-span-8">
            {questions.map(({ q, a }) => (
              <div key={q} className="reveal border-b border-border py-8">
                <dt className="text-xl font-semibold tracking-tight">{q}</dt>
                <dd className="mt-3 max-w-prose leading-relaxed text-muted-foreground">{a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}

/* =================================================================== CTA */

/**
 * The closing panel carries the logo's signal line, drawn huge: the data dips,
 * recovers, and resolves into one bright point — the finding.
 */
function ClosingCta() {
  const g = MARK_GEOMETRY;

  return (
    <section className="pb-24 sm:pb-32">
      <div className="container">
        <div className="relative isolate overflow-hidden rounded-[2rem] bg-inverse px-6 py-20 text-inverse-foreground sm:px-14 sm:py-28">
          <div className="dot-field pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />
          <svg
            viewBox="4 6 24 20"
            aria-hidden="true"
            className="pointer-events-none absolute right-6 top-1/2 -z-10 hidden h-[68%] -translate-y-1/2 lg:block"
            fill="none"
          >
            <path
              d={g.line}
              stroke="hsl(var(--inverse-foreground) / 0.16)"
              strokeWidth={0.35}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle
              cx={g.datum.cx}
              cy={g.datum.cy}
              r={2.4}
              stroke="hsl(var(--primary) / 0.35)"
              strokeWidth={0.12}
            />
            <circle cx={g.datum.cx} cy={g.datum.cy} r={1.5} fill="hsl(var(--primary) / 0.16)" />
            <circle cx={g.datum.cx} cy={g.datum.cy} r={0.75} fill="hsl(var(--primary))" />
          </svg>

          <div className="max-w-2xl">
            <p className="kicker text-inverse-muted before:bg-inverse-border">Get started</p>
            <h2 className="display mt-6 text-5xl sm:text-7xl">
              See what changed <em className="text-primary">in your business.</em>
            </h2>
            <p className="mt-7 max-w-lg text-md leading-relaxed text-inverse-muted">
              Open the demo and explore a full analysis right now, or bring your own export
              and have one in under a minute.
            </p>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <Button size="xl" variant="on-inverse" asChild className="group rounded-full px-7">
                <Link href="/signup">
                  Analyse your data
                  <ArrowRight
                    className="transition-transform duration-base ease-out group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </Link>
              </Button>
              <Button
                size="xl"
                variant="on-inverse-outline"
                asChild
                className="rounded-full px-7"
              >
                <Link href="/demo">
                  <PlayCircle aria-hidden="true" />
                  See how it works
                </Link>
              </Button>
            </div>
            <p className="mt-6 text-sm text-inverse-muted">
              The demo needs no account. Nothing you do in it affects anyone else.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
