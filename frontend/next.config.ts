import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Content-Security-Policy.
 *
 * The app renders values that came from a user's spreadsheet — dataset names,
 * column headers, product and region labels — so a policy that constrains what
 * a successful injection could *do* is worth having on top of React's escaping.
 *
 * Two allowances are load-bearing and would break the product if removed:
 *
 * - `'unsafe-inline'` for styles: Tailwind is fine without it, but Recharts
 *   positions tooltips and chart surfaces with inline `style` attributes, and
 *   the pre-paint theme script sets one too.
 * - `'unsafe-eval'` in development only: the Next.js dev server's React
 *   Refresh runtime needs it. Production builds do not, and do not get it.
 *
 * `connect-src 'self'` is unusually tight for an app with an API, and correct
 * here: the browser never contacts the backend directly. Every request goes to
 * this origin and is proxied server-side, which is the same architectural
 * decision that removes CORS from the deployment.
 */
function contentSecurityPolicy(): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", ...(isProduction ? [] : ["'unsafe-eval'"])],
    "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    "font-src": ["'self'", "https://fonts.gstatic.com", "data:"],
    "img-src": ["'self'", "data:", "blob:"],
    "connect-src": ["'self'", ...(isProduction ? [] : ["ws:", "http://localhost:*"])],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
    "manifest-src": ["'self'"],
  };

  if (isProduction) directives["upgrade-insecure-requests"] = [];

  return Object.entries(directives)
    .map(([directive, values]) => (values.length ? `${directive} ${values.join(" ")}` : directive))
    .join("; ");
}

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy() },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  // Sent only from production builds. Issuing HSTS from a local HTTP server
  // pins `localhost` to HTTPS in the developer's browser, which is both
  // confusing and irritating to undo.
  ...(isProduction
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // No `serverActions.bodySizeLimit` here, deliberately.
  //
  // It used to be set to 50mb "for uploads", which did nothing: uploads go
  // through the `/api/backend/[...path]` route handler, and that option governs
  // Server Actions only — of which this application has none. The real ceilings
  // are the backend's MAX_UPLOAD_SIZE_MB and, on a serverless host, the
  // platform's own request-body limit, which no framework setting can raise.
  // The browser enforces the smaller of the two first, via MAX_UPLOAD_MB, so the
  // rejection is phrased in the product's words. See lib/site.ts.
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // Session and analysis responses must never be held by a shared cache.
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
    ];
  },
};

export default nextConfig;
