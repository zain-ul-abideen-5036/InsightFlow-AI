import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * The authenticated front door.
 *
 * This was a 400px form floating in the centre of a 1440px white page with
 * about 300px of nothing below it — the most recognisable "student project"
 * layout on the web, and the first impression a visitor gets after deciding
 * to try the product.
 *
 * Two panels now. The form keeps a comfortable measure on the left; the right
 * carries the one argument worth making at the moment someone is deciding
 * whether to hand over a spreadsheet, with a real figure from the sample
 * analysis rather than an adjective. Below 1024px the panel drops away
 * entirely rather than stacking — on a phone it would be three screens of
 * marketing above a login box.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[1fr_1.05fr]">
      {/* ------------------------------------------------------------ Form */}
      <div className="flex min-h-dvh flex-col">
        <header className="flex items-center justify-between px-6 py-5 sm:px-10">
          <Link
            href="/"
            aria-label="InsightFlow AI home"
            className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Logo />
          </Link>
          <ThemeToggle />
        </header>

        <main
          id="main"
          className="flex flex-1 items-center justify-center px-6 pb-12 pt-2 sm:px-10"
        >
          <div className="w-full max-w-[26rem]">{children}</div>
        </main>

        <footer className="px-6 py-6 sm:px-10">
          <p className="text-xs text-subtle-foreground">
            Your business data stays in your workspace.{" "}
            <Link
              href="/#security"
              className="underline underline-offset-2 hover:text-foreground"
            >
              How we handle it
            </Link>
          </p>
        </footer>
      </div>

      {/* ----------------------------------------------------------- Panel */}
      <aside
        className="relative hidden overflow-hidden bg-inverse text-inverse-foreground lg:flex lg:flex-col lg:justify-center"
        // Supporting argument, not navigation: a screen reader user filling in
        // the form does not need it read out before the fields.
        aria-label="About InsightFlow AI"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(ellipse 60% 55% at 78% 10%, hsl(var(--primary) / 0.26), transparent 62%), radial-gradient(ellipse 50% 45% at 10% 92%, hsl(var(--chart-2) / 0.14), transparent 68%)",
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
            backgroundSize: "64px 64px",
          }}
        />

        <div className="relative mx-auto max-w-lg px-14 py-16">
          <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-inverse-muted">
            Understand your business. Act on the data.
          </p>
          <h2 className="mt-5 text-4xl font-semibold leading-[1.1] tracking-tight">
            AI explains your data.
            <br />
            <span className="text-inverse-muted">It doesn&rsquo;t invent it.</span>
          </h2>

          <ul className="mt-9 space-y-3.5">
            {[
              "Every figure is computed by a deterministic engine, not generated.",
              "Each claim opens to show the calculation, column, period and row count.",
              "Coincidence is reported as coincidence, never as a cause.",
            ].map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm leading-relaxed">
                <CheckCircle2
                  className="mt-0.5 size-4 shrink-0 text-primary"
                  aria-hidden="true"
                />
                <span className="text-inverse-foreground/85">{item}</span>
              </li>
            ))}
          </ul>

          {/* A real answer from the sample analysis. Nothing here is invented
              for the marketing surface — a visitor who signs up and loads the
              sample dataset sees exactly these figures. */}
          <figure className="mt-10 rounded-2xl border border-inverse-border bg-inverse-foreground/[0.05] p-5">
            <figcaption className="text-2xs font-semibold uppercase tracking-[0.09em] text-inverse-muted">
              A real answer
            </figcaption>
            <p className="mt-2.5 text-lg font-semibold tracking-tight">
              August revenue declined 13.9%
            </p>
            <p className="mt-2 text-sm leading-relaxed text-inverse-foreground/80">
              Nova Air Purifier accounts for 62% of the change. Inventory records show zero
              available units on 7 days in the same period.
            </p>
            <p className="mt-3 border-t border-inverse-border pt-3 text-2xs text-inverse-muted">
              Confidence: moderate &middot; from the NovaMart sample dataset
            </p>
          </figure>
        </div>
      </aside>
    </div>
  );
}
