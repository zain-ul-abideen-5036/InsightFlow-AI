import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Building2,
  CheckCircle2,
  Database,
  FileText,
  Lock,
  MessageSquareText,
  PlayCircle,
  Search,
  ShieldCheck,
  Sparkles,
  Store,
  TrendingUp,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardPreview } from "@/app/(marketing)/dashboard-preview";

/**
 * The landing page.
 *
 * The previous version ran eight sections in an identical rhythm —
 * `border-b py-20`, centred h2, centred lede, three bordered cards — so the
 * page had no pacing and a reader could not tell which section mattered.
 *
 * Each band now has a distinct silhouette: a tinted hero the product shot
 * breaks out of, a bordered strip, an asymmetric two-column problem statement,
 * a numbered flow on a recessed surface, a feature grid, an **inverted**
 * section for the trust argument, and a bordered list for the FAQ. Nothing is
 * varied for its own sake; each treatment matches what the section is doing.
 */
export default function LandingPage() {
  return (
    <>
      {/* ---------------------------------------------------------------- Hero */}
      <section className="hero-surface relative overflow-hidden border-b border-border">
        <div className="hero-grid pointer-events-none absolute inset-0" aria-hidden="true" />

        <div className="container relative pb-0 pt-12 sm:pt-16">
          <div className="mx-auto max-w-4xl text-center">
            <Badge
              variant="outline"
              size="lg"
              className="mb-6 border-border bg-card/80 shadow-e0 backdrop-blur"
            >
              <Sparkles className="text-primary" aria-hidden="true" />
              AI explains your data. It doesn&rsquo;t invent it.
            </Badge>

            {/* `text-balance` fights an explicit line break: together they
                split "Understand your business." across two lines and gave the
                headline three. The break is the design, so balancing is off. */}
            <h1 className="text-[2.6rem] font-semibold leading-[1.05] tracking-[-0.032em] sm:text-6xl lg:text-[4rem]">
              Understand your business.
              <br />
              <span className="text-muted-foreground">Act on the data.</span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground text-pretty">
              Upload your business data, discover what changed, investigate why it changed,
              and ask questions answered with evidence from your own figures.
            </p>

            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button size="xl" asChild>
                <Link href="/signup">
                  Analyse your data
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <Button size="xl" variant="outline" asChild>
                <Link href="/demo">
                  <PlayCircle aria-hidden="true" />
                  See how it works
                </Link>
              </Button>
            </div>

            <p className="mt-4 text-sm text-subtle-foreground">
              Works with CSV and Excel exports. The demo needs no account and no file.
            </p>
          </div>

          {/*
            The product shot breaks the fold.

            It used to begin below it, which meant the single most persuasive
            asset on the page — a picture of the thing working — was invisible
            to anyone who did not scroll. Negative bottom margin lets it
            overlap the next band, so it reads as an object sitting on the
            page rather than as another section.
          */}
          <div className="relative mx-auto mt-12 max-w-5xl">
            <div
              aria-hidden="true"
              className="absolute -inset-x-8 -top-6 bottom-8 rounded-[2rem] bg-primary/[0.07] blur-2xl"
            />
            <DashboardPreview className="relative" />
          </div>
        </div>

        {/* The shot's lower edge sits over this, so the hero does not end in a
            hard line directly beneath it. */}
        <div className="h-16 sm:h-24" aria-hidden="true" />
      </section>

      {/* ------------------------------------------------------------ Built for */}
      <section id="product" className="border-b border-border bg-surface-sunken/60 py-10">
        <div className="container">
          <p className="text-center text-2xs font-semibold uppercase tracking-[0.12em] text-subtle-foreground">
            Built for
          </p>
          {/* Deliberately not customer logos or testimonials: this product has
              no customers yet, and inventing social proof would undermine the
              honesty the rest of the product is built on. */}
          <ul className="mx-auto mt-5 flex max-w-4xl flex-wrap items-center justify-center gap-x-9 gap-y-3">
            {[
              { icon: Store, label: "E-commerce teams" },
              { icon: Building2, label: "Agencies" },
              { icon: TrendingUp, label: "Founders" },
              { icon: Users, label: "Operators" },
              { icon: BarChart3, label: "Growing businesses" },
            ].map(({ icon: Icon, label }) => (
              <li
                key={label}
                className="flex items-center gap-2 text-sm font-medium text-muted-foreground"
              >
                <Icon className="size-4 text-subtle-foreground" aria-hidden="true" />
                {label}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* -------------------------------------------------------------- Problem */}
      {/* Asymmetric: the claim on the left, the three failures stacked on the
          right. A centred heading over a three-column grid would make this
          look like the feature section it is arguing against. */}
      <section id="problem" className="border-b border-border py-20 sm:py-24">
        <div className="container">
          <div className="mx-auto grid max-w-6xl gap-x-14 gap-y-10 lg:grid-cols-[0.85fr_1fr]">
            <div className="lg:sticky lg:top-28 lg:self-start">
              <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                You can see that something changed. Finding out what takes a week.
              </h2>
              <p className="mt-5 max-w-prose text-md leading-relaxed text-muted-foreground">
                The numbers exist. Getting from &ldquo;revenue is down&rdquo; to
                &ldquo;here is what moved, and here is what to do&rdquo; is the part that
                never happens.
              </p>
              <p className="mt-5 max-w-prose text-md leading-relaxed">
                InsightFlow does the analysis the way an analyst would, shows you the
                working, and tells you what it cannot establish.
              </p>
            </div>

            <ul className="space-y-3">
              {[
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
              ].map(({ title, body }, index) => (
                <li
                  key={title}
                  className="flex gap-4 rounded-xl border border-border bg-card p-5 shadow-e1"
                >
                  <span
                    className="tabular mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-semibold text-muted-foreground"
                    aria-hidden="true"
                  >
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="text-md font-semibold text-balance">{title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                      {body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- How it works */}
      <section
        id="how-it-works"
        className="border-b border-border bg-surface-sunken/60 py-20 sm:py-24"
      >
        <div className="container">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">How it works</h2>
            <p className="mt-4 text-md leading-relaxed text-muted-foreground">
              From a spreadsheet to a decision, in four steps.
            </p>
          </div>

          {/* A connected flow rather than four detached cards: the line is the
              point, because these steps happen in order. */}
          <ol className="relative mx-auto mt-14 grid max-w-6xl gap-6 md:grid-cols-4">
            <div
              className="absolute inset-x-[12.5%] top-5 hidden h-px bg-gradient-to-r from-border via-border-strong to-border md:block"
              aria-hidden="true"
            />
            {[
              {
                step: "01",
                title: "Upload your data",
                body: "CSV or Excel. We read it, work out what each column means, and show you what we found before anything runs.",
              },
              {
                step: "02",
                title: "InsightFlow understands the dataset",
                body: "Metrics, trends, segments and anomalies — computed in the engine, only where your columns actually support them.",
              },
              {
                step: "03",
                title: "Explore metrics and insights",
                body: "What moved, by how much, and how much of the total change each part of the business accounts for.",
              },
              {
                step: "04",
                title: "Ask questions and investigate",
                body: "Drill into any finding, open the evidence behind it, and ask follow-ups in plain English.",
              },
            ].map((item) => (
              <li key={item.step} className="relative text-center md:text-left">
                <span
                  className="tabular relative z-10 mx-auto flex size-10 items-center justify-center rounded-xl border border-border bg-card text-xs font-semibold text-primary shadow-e1 md:mx-0"
                  aria-hidden="true"
                >
                  {item.step}
                </span>
                <h3 className="mt-4 text-md font-semibold text-balance">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ------------------------------------------------------------- Features */}
      <section id="features" className="border-b border-border py-20 sm:py-24">
        <div className="container">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              An analytics engine, with an AI that explains it
            </h2>
            <p className="mt-4 text-md leading-relaxed text-muted-foreground">
              Every number is computed from your data by a deterministic engine. The AI
              layer puts those numbers into plain English — it never produces them.
            </p>
          </div>

          <div className="mx-auto mt-14 grid max-w-6xl gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: Database,
                title: "Automated analytics",
                body: "Revenue, profit, margins, orders, customers, and average order value — calculated only where your data actually supports them.",
              },
              {
                icon: Search,
                title: "Anomaly detection",
                body: "Rolling statistics, interquartile ranges, and isolation forests, each applied where it fits rather than everywhere.",
              },
              {
                icon: Sparkles,
                title: "AI investigation",
                body: "When something moves, see which products, regions, or channels account for it — and what coincided with it.",
              },
              {
                icon: MessageSquareText,
                title: "Business questions",
                body: "Ask why revenue declined. Get an answer backed by figures you can open and inspect, and follow-ups this dataset can actually answer.",
              },
              {
                icon: FileText,
                title: "Performance reports",
                body: "A shareable report with the executive summary, key figures, trends, and what deserves attention.",
              },
              {
                icon: ShieldCheck,
                title: "Evidence on every claim",
                body: "Each figure carries the calculation, the column, the period, and the row count behind it.",
              },
            ].map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="group rounded-xl border border-border bg-card p-6 shadow-e1 transition-[box-shadow,border-color,transform] duration-base ease-out hover:-translate-y-px hover:border-border-strong hover:shadow-e2"
              >
                <div className="flex size-10 items-center justify-center rounded-xl bg-primary-subtle text-primary ring-1 ring-inset ring-info-border/50">
                  <Icon className="size-5" aria-hidden="true" />
                </div>
                <h3 className="mt-4 text-md font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- Evidence proof */}
      {/*
        Inverted, full-bleed.

        This is the product's actual differentiator and it used to be a
        two-column block visually indistinguishable from every other section —
        the strongest argument given the least emphasis. It is now the only
        dark band on the page, which is the whole reason to have one.
      */}
      <section id="evidence" className="relative overflow-hidden bg-inverse py-20 text-inverse-foreground sm:py-28">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(ellipse 55% 60% at 82% 6%, hsl(var(--primary) / 0.24), transparent 64%), radial-gradient(ellipse 45% 50% at 6% 96%, hsl(var(--chart-2) / 0.14), transparent 68%)",
          }}
        />
        <div className="container relative">
          <div className="mx-auto max-w-4xl text-center">
            <Badge variant="on-inverse" size="lg" className="mb-6">
              Why this is not an AI wrapper
            </Badge>
            <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-5xl">
              AI explains your data.
              <br />
              <span className="text-inverse-muted">It doesn&rsquo;t invent it.</span>
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-md leading-relaxed text-inverse-muted text-pretty">
              Language models cannot reliably add up thousands of rows, and a confident
              wrong number is worse than no number. So InsightFlow computes every figure
              first, then asks the model to phrase what was found.
            </p>
          </div>

          <div className="mx-auto mt-14 grid max-w-6xl items-start gap-10 lg:grid-cols-[1fr_1.1fr]">
            <ul className="space-y-3">
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
                <li
                  key={title}
                  className="flex gap-3.5 rounded-xl border border-inverse-border bg-inverse-foreground/[0.05] p-4"
                >
                  <CheckCircle2
                    className="mt-0.5 size-5 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  <div>
                    <h3 className="text-sm font-semibold">{title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-inverse-muted">{body}</p>
                  </div>
                </li>
              ))}
            </ul>

            {/* A real answer, rendered the way the product renders one. */}
            <div className="overflow-hidden rounded-2xl border border-inverse-border bg-inverse-foreground/[0.04] shadow-e3">
              <div className="border-b border-inverse-border px-5 py-4">
                <p className="text-2xs font-semibold uppercase tracking-[0.09em] text-inverse-muted">
                  Answer
                </p>
                <h3 className="mt-2 text-xl font-semibold tracking-tight">
                  August revenue declined 13.9%
                </h3>
              </div>

              <dl className="grid grid-cols-3 gap-4 border-b border-inverse-border bg-inverse-foreground/[0.04] px-5 py-4">
                {[
                  { label: "Revenue, Aug 2026", value: "$193,033" },
                  { label: "Revenue, Jul 2026", value: "$224,076" },
                  { label: "Change", value: "−13.9%" },
                ].map(({ label, value }) => (
                  <div key={label} className="min-w-0">
                    <dt className="truncate text-2xs text-inverse-muted">{label}</dt>
                    <dd className="tabular mt-0.5 text-lg font-semibold">{value}</dd>
                  </div>
                ))}
              </dl>

              <div className="space-y-4 px-5 py-4 text-sm">
                <div>
                  <p className="text-2xs font-semibold uppercase tracking-[0.09em] text-inverse-muted">
                    What the data shows
                  </p>
                  <p className="mt-1.5 leading-relaxed text-inverse-foreground/90">
                    Nova Air Purifier fell by USD 19,193, which is 62% of the total change.
                    Inventory records show zero available units on 7 days in this period.
                  </p>
                </div>

                <div className="rounded-xl border border-warning/30 bg-warning/10 px-3.5 py-3">
                  <p className="text-2xs font-semibold text-warning">
                    Possible explanation{" "}
                    <span className="font-normal text-inverse-muted">
                      — consistent with the data, not established by it
                    </span>
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed text-inverse-foreground/85">
                    The stockout coincides with the decline. The data is consistent with an
                    inventory shortage, though it cannot confirm it as the cause.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-inverse-border px-5 py-3">
                <Badge variant="on-inverse">Confidence: moderate</Badge>
                <span className="text-2xs text-inverse-muted">
                  From the NovaMart sample dataset
                </span>
              </div>
            </div>
          </div>

          <p className="mx-auto mt-12 max-w-2xl text-center text-md font-medium">
            Turn the AI off entirely and the product still works.{" "}
            <span className="text-inverse-muted">
              The whole test suite runs that way.
            </span>
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------------ Use cases */}
      <section id="use-cases" className="border-b border-border py-20 sm:py-24">
        <div className="container">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              What people bring it
            </h2>
            <p className="mt-4 text-md leading-relaxed text-muted-foreground">
              Any export with a date, an amount, and something to group by. The engine
              reports the metrics your columns support and states plainly which ones they
              do not.
            </p>
          </div>

          <div className="mx-auto mt-14 grid max-w-6xl gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: Store,
                title: "Online retail",
                question: "Why did last month fall short?",
                body: "An order export becomes revenue, margin, and average order value by product, category, and region — with the segments that moved ranked by how much of the change they account for.",
              },
              {
                icon: Building2,
                title: "Subscription businesses",
                question: "Which plan is quietly shrinking?",
                body: "Monthly revenue by plan and cohort, with the trend separated from the noise, so a slow decline is visible before it shows up in the total.",
              },
              {
                icon: Store,
                title: "Restaurants and hospitality",
                question: "Which days actually make money?",
                body: "Covers, spend per head, and discounting by day of week and site, with weekly seasonality reported only where there is enough history to justify the claim.",
              },
              {
                icon: Database,
                title: "Inventory and operations",
                question: "Did a stockout cost us sales?",
                body: "Zero-availability days are lined up against the sales that fell, and reported as a coincidence with a stated confidence — never as a proven cause.",
              },
              {
                icon: Users,
                title: "Customer analysis",
                question: "Are we growing, or churning quietly?",
                body: "New against returning revenue, concentration risk, and revenue per customer — computed only when the file actually carries a customer identifier.",
              },
              {
                icon: FileText,
                title: "Monthly reporting",
                question: "What do I send the board?",
                body: "A performance report with the executive summary, key figures, trends, and what deserves attention, with figures fixed at generation time so they never move under you.",
              },
            ].map(({ icon: Icon, title, question, body }) => (
              <div
                key={title}
                className="rounded-xl border border-border bg-card p-6 shadow-e1 transition-[box-shadow,border-color,transform] duration-base ease-out hover:-translate-y-px hover:border-border-strong hover:shadow-e2"
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Icon className="size-4" aria-hidden="true" />
                  </div>
                  <h3 className="text-sm font-semibold">{title}</h3>
                </div>
                <p className="mt-4 text-md font-medium text-balance">{question}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- Security */}
      <section
        id="security"
        className="border-b border-border bg-surface-sunken/60 py-20 sm:py-24"
      >
        <div className="container">
          <div className="mx-auto max-w-3xl">
            <div className="text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-border bg-card text-primary shadow-e1">
                <Lock className="size-5" aria-hidden="true" />
              </div>
              <h2 className="mt-6 text-3xl font-semibold tracking-tight sm:text-4xl">
                Your business data stays yours
              </h2>
            </div>

            <div className="mt-12 grid gap-4 sm:grid-cols-2">
              {[
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
              ].map((item) => (
                <div key={item.title} className="rounded-xl border border-border bg-card p-5 shadow-e1">
                  <h3 className="text-sm font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>

            {/* An honest statement of what we have not done is itself a trust signal. */}
            <p className="mt-9 text-center text-xs leading-relaxed text-subtle-foreground">
              InsightFlow AI does not hold SOC 2, ISO 27001, HIPAA, or GDPR certification.
              We describe the controls that exist rather than claiming ones that do not.
            </p>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ FAQ */}
      <section id="faq" className="border-b border-border py-20 sm:py-24">
        <div className="container">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Questions worth asking first
            </h2>
          </div>

          <dl className="mx-auto mt-12 max-w-3xl divide-y divide-border border-y border-border">
            {[
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
            ].map(({ q, a }) => (
              <div key={q} className="grid gap-x-10 gap-y-2 py-7 md:grid-cols-[0.8fr_1.2fr]">
                <dt className="text-md font-semibold text-balance">{q}</dt>
                <dd className="text-sm leading-relaxed text-muted-foreground text-pretty">{a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ------------------------------------------------------------------ CTA */}
      <section className="py-20 sm:py-24">
        <div className="container">
          <div className="relative mx-auto max-w-4xl overflow-hidden rounded-3xl border border-border bg-card px-6 py-14 text-center shadow-e2 sm:px-12">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage:
                  "radial-gradient(ellipse 60% 70% at 50% -10%, hsl(var(--primary) / 0.12), transparent 68%)",
              }}
            />
            <div className="relative">
              <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                See what changed in your business
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-md leading-relaxed text-muted-foreground">
                Open the demo and explore a full analysis right now, or bring your own
                export and have one in under a minute.
              </p>
              <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Button size="xl" asChild>
                  <Link href="/signup">
                    Analyse your data
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
                <Button size="xl" variant="outline" asChild>
                  <Link href="/demo">
                    <PlayCircle aria-hidden="true" />
                    See how it works
                  </Link>
                </Button>
              </div>
              <p className="mt-5 text-sm text-subtle-foreground">
                The demo needs no account. Nothing you do in it affects anyone else.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
