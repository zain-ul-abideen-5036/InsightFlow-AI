import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/site";

/**
 * Generated rather than served from `public/robots.txt`, so the `Sitemap:` line
 * names the host this deployment is actually running on. A static file would
 * hard-code one environment's URL into every other environment.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/login", "/signup"],
        disallow: [
          "/api/",
          // Each visit creates a workspace. Crawling it would create thousands.
          "/demo",
          // Private to a workspace and behind a session; nothing to index.
          "/overview",
          "/datasets",
          "/insights",
          "/anomalies",
          "/reports",
          "/ask",
          "/settings",
          "/onboarding",
        ],
      },
    ],
    sitemap: siteUrl("/sitemap.xml"),
  };
}
