import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

/**
 * Four anchors, not five.
 *
 * The header used to list How it works / Features / Use cases / Security /
 * FAQ, which reads as a table of contents rather than as a product menu and
 * left no room for the primary action to stand out.
 */
const NAV_LINKS = [
  { href: "/#product", label: "Product" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#features", label: "Features" },
  { href: "/#security", label: "Security" },
] as const;

/**
 * The repository this product is built from.
 *
 * Kept in an environment variable rather than hard-coded so a fork does not
 * ship a footer link pointing back at someone else's repository.
 */
const SOURCE_URL =
  process.env.NEXT_PUBLIC_SOURCE_URL ??
  "https://github.com/zain-ul-abideen-5036/InsightFlow-AI";

/**
 * The public pages are dark by design, whatever the visitor's theme.
 *
 * The `dark` class on this wrapper re-points every token beneath it at the
 * dark palette, so the landing page is one considered composition rather
 * than two half-tuned ones. The application itself keeps the visitor's
 * chosen theme; this wrapper does not reach it.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dark flex min-h-dvh flex-col bg-background text-foreground [color-scheme:dark]">
      {/* A floating bar rather than a full-width strip: it sits inside the
          container, so the page reads edge to edge beneath it. */}
      <header className="sticky top-0 z-40 px-3 pt-3 sm:px-4">
        <div className="mx-auto flex h-14 max-w-[1240px] items-center justify-between gap-4 rounded-2xl border border-white/[0.08] bg-background/60 pl-4 pr-2 shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.05),0_16px_40px_-20px_hsl(0_0%_0%/0.8)] backdrop-blur-xl backdrop-saturate-150">
          <Link
            href="/"
            aria-label="InsightFlow AI home"
            className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Logo />
          </Link>

          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="rounded-full px-3.5 py-1.5 text-sm text-muted-foreground transition-colors duration-fast hover:bg-white/[0.06] hover:text-foreground"
              >
                {label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              asChild
              className="hidden rounded-full hover:bg-white/[0.06] sm:inline-flex"
            >
              <Link href="/login">Sign in</Link>
            </Button>
            <Button
              size="sm"
              asChild
              className="rounded-full bg-foreground px-4 text-background hover:bg-foreground/90 active:bg-foreground/85"
            >
              <Link href="/signup">Try InsightFlow</Link>
            </Button>
          </div>
        </div>
      </header>

      <main id="main" className="flex-1">
        {children}
      </main>

      <footer className="relative overflow-hidden border-t border-white/[0.06]">
        {/* A thin line of light along the top edge, and a low glow beneath it. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-0 h-64 w-[48rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/[0.07] blur-[100px]"
        />

        <div className="container relative pt-20">
          <div className="grid gap-14 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <Logo />
              <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-muted-foreground">
                An AI business operations analyst. Every figure computed, every claim
                traceable.
              </p>

              <ul className="mt-6 flex flex-wrap gap-2">
                {["MIT licensed", "Works without AI", "Evidence on every figure"].map(
                  (label) => (
                    <li
                      key={label}
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-xs text-muted-foreground"
                    >
                      <span className="size-1 rounded-full bg-primary" aria-hidden="true" />
                      {label}
                    </li>
                  ),
                )}
              </ul>

              <div className="mt-8 flex items-center gap-2.5">
                <Button
                  size="sm"
                  asChild
                  className="group h-9 rounded-full bg-foreground px-4 text-background hover:bg-foreground/90 active:bg-foreground/85"
                >
                  <Link href="/demo">
                    Open the live demo
                    <ArrowRight
                      className="transition-transform duration-base ease-out group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </Link>
                </Button>
                <a
                  href={SOURCE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="InsightFlow AI source code on GitHub"
                  className="flex size-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-muted-foreground transition-colors duration-base hover:border-white/20 hover:text-foreground"
                >
                  <GitHubMark className="size-4" />
                </a>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 lg:col-span-7">
              <FooterColumn
                title="Product"
                links={[
                  { href: "/#features", label: "Features" },
                  { href: "/#how-it-works", label: "How it works" },
                  { href: "/#use-cases", label: "Use cases" },
                  { href: "/demo", label: "Live demo" },
                ]}
              />
              <FooterColumn
                title="Trust"
                links={[
                  { href: "/#evidence", label: "How answers are checked" },
                  { href: "/#security", label: "Security" },
                  { href: "/#faq", label: "FAQ" },
                ]}
              />
              <FooterColumn
                title="Get started"
                links={[
                  { href: "/signup", label: "Create an account" },
                  { href: "/login", label: "Sign in" },
                  { href: SOURCE_URL, label: "Source code", external: true },
                ]}
              />
            </div>
          </div>

          {/* The legal bar: short, structured statements rather than one
              run-on paragraph, so each fact can be read at a glance. */}
          <div className="mt-16 border-t border-white/[0.06] py-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-center gap-3 text-sm text-muted-foreground">
                <span>&copy; {new Date().getFullYear()} InsightFlow AI</span>
                <span className="h-3.5 w-px bg-white/10" aria-hidden="true" />
                <a
                  href={`${SOURCE_URL}/blob/main/LICENSE`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors duration-base hover:text-foreground"
                >
                  MIT License
                </a>
              </p>
              <p className="inline-flex w-fit items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] py-1 pl-2.5 pr-3 text-xs text-muted-foreground">
                <span className="relative flex size-1.5">
                  <span className="absolute inset-0 rounded-full bg-success/40 blur-[2px]" />
                  <span className="relative size-1.5 rounded-full bg-success" />
                </span>
                Figures computed from NovaMart sample data
              </p>
            </div>

            <ul className="mt-5 flex flex-col gap-1.5 text-xs text-subtle-foreground sm:flex-row sm:flex-wrap sm:gap-x-6">
              <li>NovaMart is generated data, not a real business.</li>
              <li>No SOC 2, ISO 27001, HIPAA or GDPR certification is claimed.</li>
              <li>No trademark is claimed.</li>
            </ul>
          </div>
        </div>

        {/* The name, set once at poster scale and cropped by the page edge. */}
        <p
          aria-hidden="true"
          className="display pointer-events-none -mb-[0.24em] select-none bg-gradient-to-b from-white/[0.09] via-white/[0.04] to-transparent bg-clip-text text-center text-[18vw] leading-none text-transparent"
        >
          InsightFlow
        </p>
      </footer>
    </div>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: readonly { href: string; label: string; external?: boolean }[];
}) {
  const linkClass =
    "group inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors duration-base hover:text-foreground";

  return (
    <nav aria-label={title}>
      <h2 className="text-sm font-medium text-foreground">{title}</h2>
      <ul className="mt-4 space-y-3">
        {links.map(({ href, label, external }) => (
          <li key={href}>
            {external ? (
              <a href={href} target="_blank" rel="noopener noreferrer" className={linkClass}>
                {label}
                <ArrowUpRight
                  className="size-3.5 opacity-60 transition-transform duration-base ease-out group-hover:-translate-y-px group-hover:translate-x-px"
                  aria-hidden="true"
                />
              </a>
            ) : (
              <Link href={href} className={linkClass}>
                {label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * The GitHub mark. Lucide's brand icons are deprecated and due for removal,
 * so the mark is drawn here from GitHub's published path.
 */
function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}
