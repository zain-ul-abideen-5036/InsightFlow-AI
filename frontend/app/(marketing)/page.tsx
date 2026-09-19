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

export default function LandingPage() {
  return (
    <>
      {/* ---------------------------------------------------------------- Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="grid-backdrop pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="container relative py-20 lg:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="outline" className="mb-6 px-3 py-1 text-xs">
              <Sparkles className="text-primary" aria-hidden="true" />
              AI business operations analyst
            </Badge>

            <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
              Understand your business.
              <br />
              <span className="text-muted-foreground">Act on the data.</span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              InsightFlow AI turns your business data into clear trends, anomalies,
              explanations, and actionable insights — and shows you the evidence behind
              every figure.
            </p>

            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button size="lg" asChild>
                <Link href="/signup">
                  Analyze your data
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/demo">Explore the live demo</Link>
              </Button>
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
              Works with CSV and Excel exports. The demo needs no account and no file.
            </p>
          </div>

          <div className="mx-auto mt-16 max-w-5xl">
            <DashboardPreview />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ Built for */}
      <section className="border-b border-border bg-surface py-12">
        <div className="container">
          <p className="text-center text-2xs font-medium uppercase tracking-widest text-muted-foreground">
            Built for
          </p>
          {/* Deliberately not customer logos or testimonials: this product has
              no customers yet, and inventing social proof would undermine the
              honesty the rest of the product is built on. */}
          <ul className="mx-auto mt-6 flex max-w-4xl flex-wrap items-center justify-center gap-x-8 gap-y-4">
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
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* -------------------------------------------------------------- Problem */}
      <section id="problem" className="border-b border-border py-20">
        <div className="container">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-balance">
              You can see that something changed. Finding out what takes a week.
            </h2>
            <p className="mt-4 text-md leading-relaxed text-muted-foreground">
              The numbers exist. Getting from &ldquo;revenue is down&rdquo; to
              &ldquo;here is what moved, and here is what to do&rdquo; is the part that
              never happens.
            </p>
          </div>

          <div className="mx-auto mt-12 grid max-w-5xl gap-5 md:grid-cols-3">
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
            ].map(({ title, body }) => (
              <div
                key={title}
                className="rounded-lg border border-border bg-card p-6"
              >
                <h3 className="text-md font-semibold text-balance">{title}</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
                  {body}
                </p>
              </div>
            ))}
          </div>

          <p className="mx-auto mt-10 max-w-2xl text-center text-md leading-relaxed">
            InsightFlow does the analysis the way an analyst would, shows you the working,
            and tells you what it cannot establish.
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------- How it works */}
      <section id="how-it-works" className="border-b border-border py-20">
        <div className="container">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight">How it works</h2>
            <p className="mt-3 text-md text-muted-foreground">
              From spreadsheet to decision in five steps.
            </p>
          </div>

          <ol className="mx-auto mt-12 grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-5">
            {[
              { step: "01", title: "Upload your data", body: "CSV or Excel. We detect the columns and show you what we found." },
              { step: "02", title: "InsightFlow analyzes it", body: "Metrics, trends, segments, and anomalies — all computed, not guessed." },
              { step: "03", title: "Discover what changed", body: "Insight cards rank what moved and how much it matters." },
              { step: "04", title: "Investigate why", body: "Drill into any finding and see the evidence behind it." },
              { step: "05", title: "Decide what to do next", body: "Get specific things to check, and a report you can share." },
            ].map((item) => (
              <li key={item.step} className="relative rounded-lg border border-border bg-card p-5">
                <span className="tabular text-2xs font-semibold tracking-widest text-primary">
                  {item.step}
                </span>
                <h3 className="mt-2 text-sm font-semibold">{item.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ------------------------------------------------------------- Features */}
      <section id="features" className="border-b border-border bg-surface py-20">
        <div className="container">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight">
              An analytics engine, with an AI that explains it
            </h2>
            <p className="mt-3 text-md leading-relaxed text-muted-foreground">
              Every number is computed from your data by a deterministic engine. The AI
              layer puts those numbers into plain English — it never produces them.
            </p>
          </div>

          <div className="mx-auto mt-12 grid max-w-6xl gap-5 md:grid-cols-2 lg:grid-cols-3">
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
                body: "Ask why revenue declined. Get an answer backed by figures you can open and inspect.",
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
              <div key={title} className="rounded-lg border border-border bg-card p-6">
                <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Icon className="size-4.5" aria-hidden="true" />
                </div>
                <h3 className="mt-4 text-md font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ Use cases */}
      <section id="use-cases" className="border-b border-border py-20">
        <div className="container">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight">
              What people bring it
            </h2>
            <p className="mt-3 text-md leading-relaxed text-muted-foreground">
              Any export with a date, an amount, and something to group by. The engine
              reports the metrics your columns support and states plainly which ones they
              do not.
            </p>
          </div>

          <div className="mx-auto mt-12 grid max-w-6xl gap-5 md:grid-cols-2 lg:grid-cols-3">
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
              <div key={title} className="rounded-lg border border-border bg-card p-6">
                <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Icon className="size-4.5" aria-hidden="true" />
                </div>
                <h3 className="mt-4 text-md font-semibold">{title}</h3>
                <p className="mt-1 text-sm font-medium text-primary">{question}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- Evidence proof */}
      <section id="evidence" className="border-b border-border py-20">
        <div className="container">
          <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
            <div>
              <Badge variant="outline" className="mb-4">
                Why this is not an AI wrapper
              </Badge>
              <h2 className="text-3xl font-semibold tracking-tight text-balance">
                The AI explains the evidence. It never invents it.
              </h2>
              <p className="mt-4 text-md leading-relaxed text-muted-foreground">
                Language models cannot reliably add up thousands of rows, and a
                confident wrong number is worse than no number. So InsightFlow computes
                every figure first, then asks the model to phrase what was found.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  "Every figure is checked against the analysis before you see it.",
                  "Coincidence is reported as coincidence, never as a cause.",
                  "If the data cannot answer your question, we say so.",
                  "Turn the AI off entirely and the product still works.",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm">
                    <CheckCircle2
                      className="mt-0.5 size-4 shrink-0 text-success"
                      aria-hidden="true"
                    />
                    <span className="text-muted-foreground">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
              <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                Example answer
              </p>
              <h3 className="mt-3 text-lg font-semibold">August revenue declined 13.9%</h3>

              <dl className="mt-5 space-y-4 text-sm">
                <div>
                  <dt className="font-medium">What changed</dt>
                  <dd className="mt-1 text-muted-foreground">
                    Revenue fell from USD 224,076 to USD 193,033.
                  </dd>
                </div>
                <div>
                  <dt className="font-medium">Largest contributor</dt>
                  <dd className="mt-1 text-muted-foreground">
                    Nova Air Purifier: −USD 19,193, which is 62% of the total change.
                  </dd>
                </div>
                <div>
                  <dt className="font-medium">Evidence</dt>
                  <dd className="mt-1 text-muted-foreground">
                    Inventory records show zero available units on 7 days in this period.
                  </dd>
                </div>
                <div>
                  <dt className="font-medium">Possible explanation</dt>
                  <dd className="mt-1 text-muted-foreground">
                    The stockout coincides with the decline. The data is consistent with
                    an inventory shortage, though it cannot confirm it as the cause.
                  </dd>
                </div>
              </dl>

              <div className="mt-5 flex items-center gap-2 border-t border-border pt-4">
                <Badge variant="info">Confidence: moderate</Badge>
                <span className="text-xs text-muted-foreground">
                  Based on the NovaMart sample dataset
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- Security */}
      <section id="security" className="border-b border-border bg-surface py-20">
        <div className="container">
          <div className="mx-auto max-w-3xl">
            <div className="text-center">
              <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Lock className="size-5" aria-hidden="true" />
              </div>
              <h2 className="mt-5 text-3xl font-semibold tracking-tight">
                Your business data stays yours
              </h2>
            </div>

            <div className="mt-10 grid gap-5 sm:grid-cols-2">
              {[
                { title: "Aggregates, not rows", body: "The AI layer receives computed metrics and segment names — never the rows of your file." },
                { title: "Run the model locally", body: "The default development setup uses a local model, so nothing leaves your machine at all." },
                { title: "Isolated by workspace", body: "Access is enforced in the backend on every request, not just in the interface." },
                { title: "You can see what is sent", body: "Settings shows the active AI provider and exactly what is transmitted to it." },
              ].map((item) => (
                <div key={item.title} className="rounded-lg border border-border bg-card p-5">
                  <h3 className="text-sm font-semibold">{item.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>

            {/* An honest statement of what we have not done is itself a trust signal. */}
            <p className="mt-8 text-center text-xs leading-relaxed text-muted-foreground">
              InsightFlow AI does not hold SOC 2, ISO 27001, HIPAA, or GDPR certification.
              We describe the controls that exist rather than claiming ones that do not.
            </p>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ FAQ */}
      <section id="faq" className="border-b border-border py-20">
        <div className="container">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight">
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
              <div key={q} className="py-6">
                <dt className="text-md font-semibold">{q}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">{a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ------------------------------------------------------------------ CTA */}
      <section className="py-20">
        <div className="container">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-balance">
              See what changed in your business
            </h2>
            <p className="mt-3 text-md text-muted-foreground">
              Open the demo and explore a full analysis right now, or bring your own
              export and have one in under a minute.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button size="lg" asChild>
                <Link href="/signup">
                  Analyze your data
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/demo">Explore the live demo</Link>
              </Button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              The demo needs no account. Nothing you do in it affects anyone else.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
