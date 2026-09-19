import Link from "next/link";

import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <div className="grid-backdrop pointer-events-none absolute inset-0" aria-hidden="true" />

      <header className="relative z-10 flex items-center justify-between px-6 py-5">
        <Link href="/" aria-label="InsightFlow AI home">
          <Logo />
        </Link>
        <ThemeToggle />
      </header>

      <main
        id="main"
        className="relative z-10 flex flex-1 items-center justify-center px-6 pb-16 pt-4"
      >
        <div className="w-full max-w-[400px]">{children}</div>
      </main>

      <footer className="relative z-10 px-6 py-5 text-center">
        <p className="text-2xs text-muted-foreground">
          Your business data stays in your workspace.{" "}
          <Link href="/#security" className="underline underline-offset-2 hover:text-foreground">
            How we handle it
          </Link>
        </p>
      </footer>
    </div>
  );
}
