/**
 * The public origin of this deployment.
 *
 * Read from the environment rather than inferred from request headers so that
 * metadata, sitemap, and social-preview URLs are identical no matter which host
 * a request happened to arrive on — a preview domain, a custom domain, or the
 * Vercel deployment URL all produce the same canonical links.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
).replace(/\/$/, "");

/** An absolute URL for a path on this site. */
export function siteUrl(path = "/"): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
