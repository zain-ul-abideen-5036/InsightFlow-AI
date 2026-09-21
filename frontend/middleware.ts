import { NextResponse, type NextRequest } from "next/server";

/**
 * Route protection.
 *
 * This is a **user-experience** convenience, not a security boundary. It checks
 * only for the presence of a session cookie — it does not verify the token.
 * Real authorization is enforced by the FastAPI backend on every request, which
 * is the only place it can be enforced safely.
 *
 * Its job is to send a signed-out user to the login page instead of letting
 * them watch a dashboard fail to load.
 */

const SESSION_COOKIE = "if_session";

const PROTECTED_PREFIXES = [
  "/overview",
  "/datasets",
  "/insights",
  "/anomalies",
  "/reports",
  "/ask",
  "/settings",
  "/onboarding",
];

const AUTH_PAGES = ["/login", "/signup"];

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isProtected && !hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    // Preserve the destination so the user lands where they meant to go.
    url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  // A signed-in user has no use for the login page.
  if (hasSession && AUTH_PAGES.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/overview";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Node.js, not Edge. Vercel Services does not deploy Edge Function output, and
  // this middleware has no use for the Edge runtime: it reads one cookie and
  // redirects. Stable since Next.js 15.5.
  runtime: "nodejs",
  matcher: [
    /*
     * Everything except Next internals, the API routes (which handle their own
     * auth), and the generated static assets. The metadata files are listed
     * individually because they live at the root alongside real pages.
     */
    "/((?!api|_next/static|_next/image|favicon\.ico|icon\.svg|apple-icon\.png|opengraph-image\.png|robots\.txt|sitemap\.xml).*)",
  ],
};
