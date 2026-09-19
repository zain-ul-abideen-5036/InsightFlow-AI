import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/site";

/**
 * Only the pages a search engine should know about.
 *
 * Everything under the application shell needs a session and is private to a
 * workspace, so listing it would advertise URLs that can only ever return a
 * redirect to the login page. `/demo` is excluded for a different reason: every
 * visit to it creates a workspace, and a crawler should not be doing that.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: siteUrl(), lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: siteUrl("/login"), lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: siteUrl("/signup"), lastModified: now, changeFrequency: "yearly", priority: 0.5 },
  ];
}
