import Link from "next/link";

import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
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

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/75 backdrop-blur-xl">
        <div className="container flex h-16 items-center justify-between gap-4">
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
                className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors duration-fast hover:bg-accent hover:text-foreground"
              >
                {label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/signup">Try InsightFlow</Link>
            </Button>
          </div>
        </div>
      </header>

      <main id="main" className="flex-1">
        {children}
      </main>

      <footer className="border-t border-border bg-surface-sunken/70 py-14">
        <div className="container">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
            <div className="space-y-3.5">
              <Logo size="sm" />
              <p className="max-w-64 text-sm leading-relaxed text-muted-foreground">
                An AI business operations analyst. Every figure computed, every claim
                traceable.
              </p>
            </div>

            <FooterColumn
              title="Product"
              links={[
                { href: "/#how-it-works", label: "How it works" },
                { href: "/#features", label: "Features" },
                { href: "/#use-cases", label: "Use cases" },
                { href: "/demo", label: "Live demo" },
              ]}
            />

            <FooterColumn
              title="Trust"
              links={[
                { href: "/#evidence", label: "How answers are checked" },
                { href: "/#security", label: "Security and data handling" },
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

          <div className="mt-12 border-t border-border pt-6">
            <p className="text-center text-2xs leading-relaxed text-subtle-foreground">
              &copy; {new Date().getFullYear()} InsightFlow AI. Every figure shown on this
              site comes from the included NovaMart sample dataset, which is generated
              rather than drawn from any real business. InsightFlow AI holds no SOC 2, ISO
              27001, HIPAA, or GDPR certification, and claims no trademark.
            </p>
          </div>
        </div>
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
  return (
    <nav aria-label={title}>
      <h2 className="eyebrow text-foreground">{title}</h2>
      <ul className="mt-3.5 space-y-2.5">
        {links.map(({ href, label, external }) => (
          <li key={href}>
            {external ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {label}
              </a>
            ) : (
              <Link
                href={href}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
