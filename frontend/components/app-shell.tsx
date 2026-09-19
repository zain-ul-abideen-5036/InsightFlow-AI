"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertTriangle,
  Database,
  FileText,
  LayoutDashboard,
  Lightbulb,
  LogOut,
  Menu,
  MessageSquareText,
  Settings,
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

const NAV_PRIMARY = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/datasets", label: "Datasets", icon: Database },
  { href: "/insights", label: "Insights", icon: Lightbulb },
  { href: "/anomalies", label: "Anomalies", icon: AlertTriangle },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/ask", label: "Ask InsightFlow", icon: MessageSquareText },
];

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

  // A navigation should never leave the drawer open behind the new page.
  React.useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Escape closes the drawer, as it does every other overlay in the product.
  React.useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  const handleSignOut = React.useCallback(async () => {
    await api.logout();
    router.push("/login");
    router.refresh();
  }, [router]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const navigation = (
    <nav aria-label="Main" className="flex flex-1 flex-col gap-1 px-3">
      {NAV_PRIMARY.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(href) ? "page" : undefined}
          className={cn(
            "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            isActive(href)
              ? "bg-accent font-medium text-foreground"
              : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
          )}
        >
          <Icon className="size-4 shrink-0" aria-hidden="true" />
          {label}
        </Link>
      ))}

      <div className="mt-6 px-2.5 pb-1.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
        Workspace
      </div>
      <Link
        href="/settings"
        aria-current={isActive("/settings") ? "page" : undefined}
        className={cn(
          "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isActive("/settings")
            ? "bg-accent font-medium text-foreground"
            : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
        )}
      >
        <Settings className="size-4 shrink-0" aria-hidden="true" />
        Settings
      </Link>
    </nav>
  );

  const userMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors",
            "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <span
            className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-2xs font-semibold text-primary"
            aria-hidden="true"
          >
            {initials(user.full_name, user.email)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium">
              {user.full_name || user.email}
            </span>
            <span className="block truncate text-2xs text-muted-foreground">{workspace.name}</span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings aria-hidden="true" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onClick={handleSignOut}>
          <LogOut aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="flex min-h-dvh bg-surface">
      {/* ---------------------------------------------------- Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-background lg:flex">
        <div className="flex h-14 items-center px-5">
          <Link href="/overview" aria-label="InsightFlow AI overview">
            <Logo size="sm" />
          </Link>
        </div>
        {navigation}
        <div className="border-t border-border p-2">{userMenu}</div>
      </aside>

      {/* ----------------------------------------------------- Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          {/*
            The backdrop is a click target, not a control. Making it a labelled
            button gives the drawer two elements with the accessible name
            "Close navigation", which reads as a duplicate to anyone navigating
            by landmark or button list. Escape and the explicit close button are
            the accessible ways out.
          */}
          <div
            className="absolute inset-0 bg-foreground/25 backdrop-blur-[2px]"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 left-0 flex w-64 animate-slide-up flex-col border-r border-border bg-background">
            <div className="flex h-14 items-center justify-between px-5">
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
      <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur-md lg:px-6">
          <Button
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            aria-expanded={mobileOpen}
          >
            <Menu aria-hidden="true" />
          </Button>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{workspace.name}</p>
          </div>

          <ThemeToggle />
        </header>

        <main id="main" className="min-w-0 flex-1 px-4 py-6 lg:px-6 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
