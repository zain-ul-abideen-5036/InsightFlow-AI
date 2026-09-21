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

/**
 * The largest file this deployment will accept, in megabytes.
 *
 * Browser-visible on purpose — it is printed on the dropzone and enforced
 * before a byte is sent — and not a secret: it is a number the upload form
 * already reveals by rejecting anything larger.
 *
 * It exists as a variable rather than a constant because the ceiling is a
 * property of the platform, not of the product. A Vercel Function accepts at
 * most 4.5 MB of request body and answers anything larger with its own
 * `FUNCTION_PAYLOAD_TOO_LARGE`, before this application runs at all. So on
 * Vercel this is set to 4 and the browser explains the limit in the product's
 * own words; a self-hosted deployment leaves it at 50 and nothing changes.
 *
 * Keep it at or below MAX_UPLOAD_SIZE_MB in the backend environment. The
 * backend re-validates every upload regardless, because a browser check is
 * advice, not a control.
 */
export const MAX_UPLOAD_MB = (() => {
  const parsed = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 50;
})();
