import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Building2,
  Check,
  Cpu,
  EyeOff,
  FileSpreadsheet,
  FileText,
  Layers,
  MessageSquareText,
  Package,
  Plus,
  PlayCircle,
  PowerOff,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Store,
  TrendingUp,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { SpotlightGroup } from "@/app/(marketing)/spotlight-group";
import { cn } from "@/lib/utils";

/**
 * The landing page.
 *
 * Dark, and built around the product itself. Every image here is a real
 * capture of the running application with the NovaMart sample dataset
 * loaded — the same screens and figures a visitor reaches in the demo. In a
 * product whose argument is that its numbers are traceable, a mocked-up
 * screenshot would be the one untraceable thing on the page.
 *
 * Copy is deliberately short: the captures carry the detail, and anyone who
 * wants the long answers finds them in the FAQ.
 */
export default function LandingPage() {
  return (
    <>
      <Hero />
      <Audience />
      <Statement />
      <Features />
      <HowItWorks />
      <Evidence />
      <UseCases />
      <Security />
      <Faq />
      <ClosingCta />
    </>
  );
}

/* --------------------------------------------------------------- Shared */

const PRIMARY_CTA =
  "group h-12 rounded-full bg-foreground px-6 text-[15px] font-medium text-background " +
  "shadow-[0_0_0_1px_hsl(0_0%_100%/0.1),0_10px_30px_-10px_hsl(var(--primary)/0.7)] " +
  "hover:bg-foreground/90 active:bg-foreground/85";

const SECONDARY_CTA =
  "h-12 rounded-full border border-white/10 bg-white/[0.04] px-6 text-[15px] font-medium " +
  "text-foreground backdrop-blur hover:border-white/20 hover:bg-white/[0.08] hover:text-foreground";

function CtaPair() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
      <Button asChild className={PRIMARY_CTA}>
        <Link href="/signup">
          Analyse your data
          <ArrowRight
            className="size-4 transition-transform duration-base ease-out group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </Link>
      </Button>
      <Button asChild variant="ghost" className={SECONDARY_CTA}>
        <Link href="/demo">
          <PlayCircle className="size-4" aria-hidden="true" />
          See how it works
        </Link>
      </Button>
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  muted,
  body,
  align = "center",
}: {
  eyebrow: string;
  title: string;
  muted?: string;
  body?: string;
  align?: "center" | "left";
}) {
  return (
    <div className={cn("max-w-3xl", align === "center" && "mx-auto text-center")}>
      <p className="eyebrow-pill">
        <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
        {eyebrow}
      </p>
      <h2 className="display mt-5 text-[2.25rem] leading-[1.08] sm:text-[3rem] lg:text-[3.4rem]">
        <span className="text-ink">{title}</span>
        {muted ? (
          <>
            {" "}
            <span className="text-ink-muted">{muted}</span>
          </>
        ) : null}
      </h2>
      {body ? (
        <p
          className={cn(
            "mt-5 max-w-xl text-md leading-relaxed text-muted-foreground",
            align === "center" && "mx-auto",
          )}
        >
          {body}
        </p>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------- Hero */

function Hero() {
  return (
    <section className="relative overflow-hidden pb-6">
      <div className="hero-beam pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="grid-fade pointer-events-none absolute inset-0" aria-hidden="true" />

      <div className="container relative pt-20 sm:pt-28">
        <div className="mx-auto max-w-5xl text-center">
          <Link
            href="/demo"
            className="enter group inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] py-1 pl-1 pr-3 text-sm text-muted-foreground backdrop-blur transition-colors duration-base hover:border-white/20 hover:text-foreground"
            style={{ "--enter-index": 0 } as React.CSSProperties}
          >
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
              Live demo
            </span>
            <span className="sm:hidden">Explore a full analysis</span>
            <span className="hidden sm:inline">Explore a full analysis, no account needed</span>
            <ArrowRight
              className="size-3.5 transition-transform duration-base ease-out group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </Link>

          <h1
            className="enter display mt-8 text-[2.6rem] leading-[1.04] sm:text-[3.6rem] lg:text-[4.6rem]"
            style={{ "--enter-index": 1 } as React.CSSProperties}
          >
            <span className="text-ink">Understand your business.</span>
            <br />
            <span className="text-ink-muted">Act on the data.</span>
          </h1>

          <p
            className="enter mx-auto mt-7 max-w-2xl text-lg leading-relaxed text-muted-foreground"
            style={{ "--enter-index": 2 } as React.CSSProperties}
          >
            Upload your business data, discover what changed, investigate why it changed,
            and ask questions answered with evidence from your own figures.
          </p>

          <div className="enter mt-10" style={{ "--enter-index": 3 } as React.CSSProperties}>
            <CtaPair />
            <p className="mt-5 text-sm text-subtle-foreground">
              Works with CSV and Excel exports. Every figure computed, never generated.
            </p>
          </div>
        </div>

        {/* The product, as it actually renders. It arrives tipped back and
            settles flat as it scrolls into view. */}
        <div className="relative mx-auto mt-16 max-w-6xl sm:mt-20">
          <div
            aria-hidden="true"
            className="absolute inset-x-[8%] -top-12 h-2/3 rounded-full bg-primary/25 blur-[110px]"
          />
          <div className="tilt-in relative rounded-[1.35rem] border border-white/10 bg-white/[0.03] p-1.5 backdrop-blur sm:p-2">
            <div className="pointer-events-none absolute inset-x-16 -top-px h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent" />
            <Image
              src="/marketing/overview.webp"
              alt="The InsightFlow overview for the NovaMart sample dataset: revenue down 13.9% to $193K, orders, customers and average order value with sparklines, a second row of profit, margin, units, cost, revenue per customer and discount, and a revenue-over-time chart."
              width={2400}
              height={1500}
              priority
              unoptimized
              className="rounded-2xl border border-white/[0.06]"
            />
          </div>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-background via-background/70 to-transparent"
          />
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- Audience */

function Audience() {
  const groups = [
    { icon: Store, label: "E-commerce teams" },
    { icon: Building2, label: "Agencies" },
    { icon: TrendingUp, label: "Founders" },
    { icon: Users, label: "Operators" },
    { icon: Layers, label: "Growing businesses" },
  ];

  return (
    <section id="product" aria-label="Who InsightFlow is for" className="relative pb-4 pt-6">
      <div className="container">
        <p className="text-center text-sm text-subtle-foreground">
          Built for the people who own the numbers
        </p>
        {/* Deliberately not customer logos: this product has no customers yet,
            and inventing social proof would undermine everything else here. */}
        <ul className="mx-auto mt-6 flex max-w-4xl flex-wrap items-center justify-center gap-x-10 gap-y-4">
          {groups.map(({ icon: Icon, label }) => (
            <li
              key={label}
              className="flex items-center gap-2.5 text-[15px] font-medium text-muted-foreground/80"
            >
              <Icon className="size-[18px] text-subtle-foreground" aria-hidden="true" />
              {label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ Statement */

function Statement() {
  return (
    <section id="problem" className="py-24 sm:py-28">
      <div className="container">
        <p className="reveal display mx-auto max-w-5xl text-center text-[1.6rem] leading-[1.22] sm:text-[2.75rem] sm:leading-[1.18]">
          <span className="text-ink">You can see that something changed.</span>{" "}
          <span className="text-muted-foreground/60">
            Finding out what takes a week of pivot tables, a dashboard that shows what but
            never why, and a chatbot that cannot add up.
          </span>{" "}
          <span className="text-ink">
            InsightFlow does the analysis an analyst would — and shows the working.
          </span>
        </p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- Features */

function Features() {
  return (
    <section id="features" className="pb-24 sm:pb-28">
      <div className="container">
        <SectionHeader
          eyebrow="The product"
          title="An analytics engine,"
          muted="with an AI that explains it."
          body="Every number is computed from your data by a deterministic engine. The AI puts those numbers into plain English — it never produces them."
        />

        <SpotlightGroup className="mt-16 grid gap-4 lg:grid-cols-12">
          <FeatureTile
            className="lg:col-span-7"
            icon={TrendingUp}
            title="Know what changed, ranked"
            body="Every movement in your business, ordered by how much of the total change it accounts for."
            image={{ src: "/marketing/insights.webp" }}
            alt="Insights ranked by severity: unusual revenue on 16 January 2026 at $10.3K against an expected $5,269, and Nova Air Purifier down 44.5%."
          />
          <FeatureTile
            className="lg:col-span-5"
            icon={MessageSquareText}
            title="Ask in plain English"
            body="Answers arrive with the figures behind them — computed from your data and open to inspection."
            image={{ src: "/marketing/ask.webp" }}
            alt="An answer to 'Why did revenue decline last month?': revenue fell 13.9% in August 2026, with evidence of $193K against $224.1K."
          />
          <FeatureTile
            className="lg:col-span-5"
            icon={ScanSearch}
            title="Catch what's unusual"
            body="Rolling statistics, interquartile ranges and isolation forests — each applied only where it fits."
            image={{ src: "/marketing/anomalies.webp" }}
            alt="Detected anomalies, each with the observed value, the expected value and how far outside the range it fell."
          />
          <FeatureTile
            className="lg:col-span-7"
            icon={Sparkles}
            title="Investigate why"
            body="Open any anomaly to see which channel, product or region moved — and what moved with it."
            image={{ src: "/marketing/investigation.webp" }}
            alt="An investigation of average order value on 9 May 2026, 104.5% above the expected range, broken down by channel, product, status and region."
          />
        </SpotlightGroup>

        <ul className="mx-auto mt-14 grid max-w-5xl gap-10 sm:grid-cols-3">
          {[
            {
              icon: FileText,
              title: "Board-ready reports",
              body: "Summary, key figures and trends, fixed at generation so they never move under you.",
            },
            {
              icon: ShieldCheck,
              title: "Evidence on every figure",
              body: "The calculation, column, period and row count behind each number, one click away.",
            },
            {
              icon: PowerOff,
              title: "Works with the AI off",
              body: "Analysis, anomalies and reports all run without a model. The test suite proves it.",
            },
          ].map(({ icon: Icon, title, body }) => (
            <li key={title} className="reveal">
              <Icon className="size-5 text-primary" aria-hidden="true" />
              <h3 className="mt-4 text-[15px] font-semibold">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function FeatureTile({
  className,
  icon: Icon,
  title,
  body,
  image,
  alt,
}: {
  className?: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  image: { src: string };
  alt: string;
}) {
  return (
    <article className={cn("glass spotlight reveal group flex flex-col", className)}>
      <div className="p-7 sm:p-8">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-primary">
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
        </div>
        <p className="mt-3 max-w-md text-[15px] leading-relaxed text-muted-foreground">{body}</p>
      </div>
      {/* The capture bleeds off the card's lower-right edge, so it reads as a
          window into the product rather than a picture pasted on a card. */}
      <div className="fade-out-bottom relative min-h-[15rem] flex-1 sm:min-h-[19rem]">
        <div className="absolute inset-0 left-7 overflow-hidden rounded-tl-xl border-l border-t border-white/[0.08] sm:left-8">
          <Image
            src={image.src}
            alt={alt}
            fill
            sizes="(min-width: 1024px) 60vw, 100vw"
            unoptimized
            className="origin-top-left object-cover object-left-top transition-transform duration-slow ease-out group-hover:scale-[1.02]"
          />
        </div>
      </div>
    </article>
  );
}

/* --------------------------------------------------------- How it works */

function HowItWorks() {
  const steps = [
    {
      title: "Upload your data",
      body: "CSV or Excel. We show you what each column was read as before anything runs.",
    },
    {
      title: "The engine analyses it",
      body: "Metrics, trends, segments and anomalies — only where your columns support them.",
    },
    {
      title: "See what moved",
      body: "Every change ranked by how much of the total it accounts for.",
    },
    {
      title: "Ask and investigate",
      body: "Drill into any finding and ask follow-ups in plain English.",
    },
  ];

  return (
    <section id="how-it-works" className="relative py-24 sm:py-28">
      <div className="hairline absolute inset-x-0 top-0" aria-hidden="true" />
      <div className="container">
        <SectionHeader eyebrow="How it works" title="From a spreadsheet" muted="to a decision." />

        <ol className="relative mx-auto mt-16 grid max-w-6xl gap-4 md:grid-cols-4">
          {steps.map((step, index) => (
            <li key={step.title} className="glass reveal relative p-6">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-primary">
                  {String(index + 1).padStart(2, "0")}
                </span>
                {index < steps.length - 1 ? (
                  <ArrowRight
                    className="hidden size-4 text-subtle-foreground/60 md:block"
                    aria-hidden="true"
                  />
                ) : (
                  <Check className="hidden size-4 text-primary md:block" aria-hidden="true" />
                )}
              </div>
              <h3 className="mt-8 text-[17px] font-semibold tracking-tight">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- Evidence */

function Evidence() {
  const pipeline = [
    { icon: FileSpreadsheet, title: "Your file", note: "Rows never leave this step" },
    { icon: Cpu, title: "Analytics engine", note: "Computes every figure" },
    { icon: Package, title: "Evidence bundle", note: "Aggregates and labels only" },
    { icon: Sparkles, title: "Language model", note: "Phrases what was found", model: true },
    { icon: ShieldCheck, title: "Verifier", note: "Discards unsupported figures" },
    { icon: MessageSquareText, title: "Your answer", note: "Evidence attached" },
  ];

  return (
    <section id="evidence" className="relative overflow-hidden py-24 sm:py-28">
      <div className="hairline absolute inset-x-0 top-0" aria-hidden="true" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-0 top-1/2 h-[36rem] w-[36rem] -translate-y-1/2 translate-x-1/3 rounded-full bg-primary/[0.12] blur-[120px]"
      />
      <div className="container relative">
        <div className="grid items-center gap-16 lg:grid-cols-2">
          <div>
            <SectionHeader
              align="left"
              eyebrow="Why this is not an AI wrapper"
              title="AI explains your data."
              muted="It doesn't invent it."
              body="Language models cannot reliably add up thousands of rows, and a confident wrong number is worse than none. So every figure is computed first, and the model only phrases it."
            />
            <ul className="mt-10 space-y-4">
              {[
                "Every figure computed in pandas, tested against known answers",
                "The model sees aggregates and labels — never your rows",
                "Any answer citing a figure the engine never produced is discarded",
                "Coincidence is reported as coincidence, never as a cause",
              ].map((item) => (
                <li key={item} className="flex gap-3 text-[15px]">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                    <Check className="size-3" strokeWidth={3} aria-hidden="true" />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* The pipeline as it runs. The model sits fourth, after the numbers
              already exist — which is the entire argument. */}
          <figure className="glass reveal p-6 sm:p-8">
            <figcaption className="flex items-center justify-between text-xs text-subtle-foreground">
              <span className="font-mono uppercase tracking-[0.14em]">Answer pipeline</span>
              <span className="hidden sm:inline">Every question, every time</span>
            </figcaption>
            <ol className="relative mt-6">
              <div
                aria-hidden="true"
                className="absolute bottom-6 left-5 top-6 w-px bg-gradient-to-b from-white/5 via-white/15 to-white/5"
              />
              {pipeline.map(({ icon: Icon, title, note, model }) => (
                <li
                  key={title}
                  className={cn(
                    "relative flex items-center gap-4 rounded-xl py-2.5",
                    model && "-mx-3 my-1 border border-primary/30 bg-primary/[0.08] px-3",
                  )}
                >
                  <span
                    className={cn(
                      "relative z-10 flex size-10 shrink-0 items-center justify-center rounded-xl border bg-card",
                      model
                        ? "border-primary/40 text-primary shadow-[0_0_24px_-4px_hsl(var(--primary)/0.6)]"
                        : "border-white/10 text-muted-foreground",
                    )}
                  >
                    <Icon className="size-[18px]" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-medium">{title}</p>
                    <p className="text-sm text-muted-foreground">{note}</p>
                  </div>
                  {model ? (
                    <span className="hidden rounded-full border border-primary/30 px-2.5 py-0.5 text-xs text-primary sm:inline">
                      After the numbers exist
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
          </figure>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ Use cases */

function UseCases() {
  const rows = [
    [
      ["Online retail", "Why did last month fall short?"],
      ["Subscriptions", "Which plan is quietly shrinking?"],
      ["Hospitality", "Which days actually make money?"],
      ["Operations", "Did a stockout cost us sales?"],
      ["Customers", "Are we growing, or churning quietly?"],
    ],
    [
      ["Reporting", "What do I send the board?"],
      ["Channels", "Which channel moved revenue?"],
      ["Pricing", "Did the discount pay for itself?"],
      ["Regions", "Where did the decline start?"],
      ["Products", "Which products are declining?"],
    ],
  ];

  return (
    <section id="use-cases" className="relative py-24 sm:py-28">
      <div className="hairline absolute inset-x-0 top-0" aria-hidden="true" />
      <div className="container">
        <SectionHeader
          eyebrow="What people bring it"
          title="Any export with a date and an amount."
          body="The engine reports the metrics your columns support, and says plainly which ones they don't."
        />
      </div>

      {/* Two strips drifting in opposite directions. Hover pauses them; with
          reduced motion they do not move at all. */}
      <ul
        aria-label="Example questions"
        className="marquee-host fade-out-x mt-16 space-y-4 overflow-hidden"
      >
        {rows.map((row, rowIndex) => (
          <li
            key={rowIndex}
            className={cn("marquee flex w-max gap-4", rowIndex === 1 && "marquee-reverse")}
          >
            {[...row, ...row].map(([category, question], index) => (
              <div
                key={`${question}-${index}`}
                aria-hidden={index >= row.length}
                className="glass flex shrink-0 items-center gap-3 rounded-full py-3 pl-3 pr-6"
              >
                <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-xs text-muted-foreground">
                  {category}
                </span>
                <span className="text-[15px] font-medium">{question}</span>
              </div>
            ))}
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------- Security */

function Security() {
  const controls = [
    {
      icon: EyeOff,
      title: "Aggregates, not rows",
      body: "The AI receives computed metrics and segment names — never the rows of your file.",
    },
    {
      icon: Cpu,
      title: "Run the model locally",
      body: "The default setup uses a local model, so nothing leaves your machine at all.",
    },
    {
      icon: Layers,
      title: "Isolated by workspace",
      body: "Access is enforced in the backend on every request, not just in the interface.",
    },
    {
      icon: ScanSearch,
      title: "See what is sent",
      body: "Settings shows the active AI provider and exactly what is transmitted to it.",
    },
  ];

  return (
    <section id="security" className="relative py-24 sm:py-28">
      <div className="hairline absolute inset-x-0 top-0" aria-hidden="true" />
      <div className="container">
        <SectionHeader eyebrow="Security" title="Your business data" muted="stays yours." />

        <SpotlightGroup className="mx-auto mt-16 grid max-w-6xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {controls.map(({ icon: Icon, title, body }) => (
            <div key={title} className="glass spotlight reveal p-6">
              <span className="flex size-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-primary">
                <Icon className="size-[18px]" aria-hidden="true" />
              </span>
              <h3 className="mt-6 text-[15px] font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
        </SpotlightGroup>

        {/* An honest statement of what we have not done is itself a trust signal. */}
        <p className="mx-auto mt-10 max-w-2xl text-center text-sm text-subtle-foreground">
          InsightFlow AI holds no SOC 2, ISO 27001, HIPAA, or GDPR certification. We describe
          the controls that exist rather than claiming ones that do not.
        </p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ FAQ */

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
    <section id="faq" className="relative py-24 sm:py-28">
      <div className="hairline absolute inset-x-0 top-0" aria-hidden="true" />
      <div className="container">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <SectionHeader align="left" eyebrow="FAQ" title="Questions worth" muted="asking first." />
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

          {/* Native disclosure: accessible, keyboard-operable, and no JavaScript. */}
          <div className="border-t border-white/[0.07] lg:col-span-8">
            {questions.map(({ q, a }) => (
              <details key={q} className="group border-b border-white/[0.07]">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-[17px] font-medium [&::-webkit-details-marker]:hidden">
                  {q}
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-white/10 text-muted-foreground transition-[transform,border-color,color] duration-slow ease-out group-hover:border-white/20 group-hover:text-foreground group-open:rotate-45">
                    <Plus className="size-3.5" aria-hidden="true" />
                  </span>
                </summary>
                <p className="max-w-2xl pb-6 pr-12 leading-relaxed text-muted-foreground">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ CTA */

function ClosingCta() {
  return (
    <section className="pb-24 sm:pb-32">
      <div className="container">
        <div className="glass relative isolate overflow-hidden rounded-[2rem] px-6 py-20 text-center sm:py-28">
          <div className="hero-beam absolute inset-0 -z-10" aria-hidden="true" />
          <div className="grid-fade absolute inset-0 -z-10" aria-hidden="true" />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-24 top-0 h-px bg-gradient-to-r from-transparent via-primary/80 to-transparent"
          />
          <h2 className="display mx-auto max-w-3xl text-[2.25rem] leading-[1.08] sm:text-[3.5rem]">
            <span className="text-ink">See what changed</span>{" "}
            <span className="text-ink-muted">in your business.</span>
          </h2>
          <p className="mx-auto mt-6 max-w-lg text-md leading-relaxed text-muted-foreground">
            Explore a full analysis right now, or bring your own export and have one in under
            a minute.
          </p>
          <div className="mt-10">
            <CtaPair />
          </div>
          <p className="mt-6 text-sm text-subtle-foreground">
            The demo needs no account. Nothing you do in it affects anyone else.
          </p>
        </div>
      </div>
    </section>
  );
}
