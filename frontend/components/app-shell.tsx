"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  ChevronsUpDown,
  Database,
  FileText,
  LayoutDashboard,
  Lightbulb,
  LogOut,
  Menu,
  MessageSquareText,
  Settings,
  Upload,
  X,
} from "lucide-react";

import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api-client";
import { cn, initials } from "@/lib/utils";
import type { User, Workspace } from "@/types/api";

/**
 * Navigation, grouped by what the thing *is*.
 *
 * The previous sidebar listed six items under no heading at all, then put a
 * `WORKSPACE` heading above a single item (Settings) — the one piece of
 * grouping present was the least useful one, and Datasets sat between
 * Overview and Insights as though browsing your files were a step in reading
 * your results.
 *
 * Three groups now, in the order a session actually runs: the analysis you
 * came to read, the data underneath it, and your account.
 */
const NAV_GROUPS = [
  {
    label: "Workspace",
    items: [
      { href: "/overview", label: "Overview", icon: LayoutDashboard },
      { href: "/insights", label: "Insights", icon: Lightbulb },
      { href: "/anomalies", label: "Anomalies", icon: AlertTriangle },
      { href: "/ask", label: "Ask InsightFlow", icon: MessageSquareText },
      { href: "/reports", label: "Reports", icon: FileText },
    ],
  },
  { label: "Data", items: [{ href: "/datasets", label: "Datasets", icon: Database }] },
  { label: "Account", items: [{ href: "/settings", label: "Settings", icon: Settings }] },
] as const;

export function AppShell({
  user,
  workspace,
  children,
}: {
  user: User;
  workspace: Workspace;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const drawerRef = React.useRef<HTMLDivElement>(null);
  const menuButtonRef = React.useRef<HTMLButtonElement>(null);

  // A navigation should never leave the drawer open behind the new page.
  React.useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  /**
   * Drawer focus management.
   *
   * The drawer declared `role="dialog" aria-modal="true"` but did nothing to
   * honour it: focus stayed on the page behind, Tab walked straight out of the
   * open drawer into content the overlay had covered, and closing it dropped
   * focus to the document body. All three are the same bug — the promise in
   * the ARIA attribute was never kept.
   */
  React.useEffect(() => {
    if (!mobileOpen) return;
    const drawer = drawerRef.current;
    if (!drawer) return;

    const opener = document.activeElement as HTMLElement | null;
    const focusable = () =>
      Array.from(
        drawer.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((node) => node.offsetParent !== null);

    focusable()[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileOpen(false);
        return;
      }
      if (event.key !== "Tab") return;

      const nodes = focusable();
      if (nodes.length === 0) return;
      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    // The page behind must not scroll under an open overlay.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      // Return focus to whatever opened it, not to the document body.
      (menuButtonRef.current ?? opener)?.focus();
    };
  }, [mobileOpen]);

  const handleSignOut = React.useCallback(async () => {
    await api.logout();
    router.push("/login");
    router.refresh();
  }, [router]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const navigation = (
    <nav aria-label="Main" className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-1">
      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="space-y-0.5">
          <h2 className="eyebrow px-2.5 pb-1.5">{group.label}</h2>
          {group.items.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm",
                  "transition-colors duration-fast ease-out",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "bg-card font-medium text-foreground shadow-e0"
                    : "text-muted-foreground hover:bg-card/70 hover:text-foreground",
                )}
              >
                {/* An accent rail, so the active page is unmistakable at a
                    glance rather than a 4% grey wash that reads as nothing. */}
                <span
                  className={cn(
                    "absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary transition-opacity duration-fast",
                    active ? "opacity-100" : "opacity-0",
                  )}
                  aria-hidden="true"
                />
                <Icon
                  className={cn(
                    "size-4 shrink-0 transition-colors",
                    active ? "text-primary" : "text-subtle-foreground group-hover:text-foreground",
                  )}
                  aria-hidden="true"
                />
                {label}
              </Link>
            );
          })}
        </div>
      ))}

      <div className="mt-auto pt-3">
        <Button variant="outline" size="sm" className="w-full justify-start" asChild>
          <Link href="/datasets/new">
            <Upload aria-hidden="true" />
            Add data
          </Link>
        </Button>
      </div>
    </nav>
  );

  const userMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left",
            "transition-colors duration-fast hover:bg-card",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <span
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-lg",
              "bg-primary/12 text-2xs font-semibold text-primary ring-1 ring-inset ring-primary/15",
            )}
            aria-hidden="true"
          >
            {initials(user.full_name, user.email)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium">
              {user.full_name || user.email}
            </span>
            <span className="block truncate text-2xs text-subtle-foreground">
              {workspace.name}
            </span>
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-subtle-foreground" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <span className="block text-xs font-medium text-foreground">
            {user.full_name || "Signed in"}
          </span>
          <span className="block truncate text-2xs text-muted-foreground">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="eyebrow">Workspace</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Check className="text-primary" aria-hidden="true" />
            <span className="truncate">{workspace.name}</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings aria-hidden="true" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem destructive onClick={handleSignOut}>
          <LogOut aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const brand = (
    <div className="flex h-topbar items-center px-4">
      <Link
        href="/overview"
        aria-label="InsightFlow AI overview"
        className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Logo size="sm" />
      </Link>
    </div>
  );

  return (
    <div className="min-h-dvh bg-background">
      {/* ---------------------------------------------------- Desktop sidebar */}
      {/* Its own surface with a defined edge, so the shell reads as a shell
          rather than as a column of links floating on the same white. */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden w-sidebar flex-col lg:flex",
          "border-r border-border bg-chrome",
        )}
      >
        {brand}
        {navigation}
        <div className="border-t border-border p-2">{userMenu}</div>
      </aside>

      {/* ----------------------------------------------------- Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/*
            The backdrop is a click target, not a control. Making it a labelled
            button gives the drawer two elements with the accessible name
            "Close navigation", which reads as a duplicate to anyone navigating
            by landmark or button list. Escape and the explicit close button are
            the accessible ways out.
          */}
          <div
            className="absolute inset-0 animate-fade-in bg-foreground/35 backdrop-blur-[3px]"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            // Slides in from the left, because that is the direction it comes
            // from. It used to translate upward while appearing at the side.
            className={cn(
              "absolute inset-y-0 left-0 flex w-[17rem] animate-slide-in-left flex-col",
              "border-r border-border bg-chrome shadow-overlay",
            )}
          >
            <div className="flex h-topbar items-center justify-between px-4">
              <Logo size="sm" />
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation"
              >
                <X aria-hidden="true" />
              </Button>
            </div>
            {navigation}
            <div className="border-t border-border p-2">{userMenu}</div>
          </div>
        </div>
      ) : null}

      {/* ------------------------------------------------------------ Content */}
      <div className="flex min-h-dvh min-w-0 flex-col lg:pl-sidebar">
        <header
          className={cn(
            "sticky top-0 z-20 flex h-topbar items-center gap-2 px-4 lg:px-7",
            "border-b border-border bg-background/80 backdrop-blur-xl",
          )}
        >
          <Button
            ref={menuButtonRef}
            variant="ghost"
            size="icon-sm"
            className="-ml-1 lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            aria-expanded={mobileOpen}
          >
            <Menu aria-hidden="true" />
          </Button>

          <Link href="/overview" className="lg:hidden" aria-label="InsightFlow AI overview">
            <Logo size="xs" showWordmark={false} />
          </Link>

          {/* The bar used to hold the workspace name as static text — a
              full-width strip spent on a label already in the user menu. It
              now carries the things that belong at the top of every screen. */}
          <div className="ml-1 hidden min-w-0 items-center gap-2 lg:flex">
            <span className="truncate text-sm font-medium">{workspace.name}</span>
            <span
              className="rounded-md bg-muted px-1.5 py-0.5 text-2xs font-medium text-muted-foreground"
              title={`Figures are shown in ${workspace.currency}`}
            >
              {workspace.currency}
            </span>
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <Button variant="ghost" size="sm" className="hidden sm:inline-flex" asChild>
              <Link href="/ask">
                <MessageSquareText aria-hidden="true" />
                Ask InsightFlow
              </Link>
            </Button>
            <ThemeToggle />
          </div>
        </header>

        <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-7 lg:py-8">
          <div className="mx-auto w-full max-w-[86rem]">{children}</div>
        </main>
      </div>
    </div>
  );
}
