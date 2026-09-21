/**
 * Telling "too slow" apart from "not there".
 *
 * Node collapses every transport failure into an opaque `TypeError: fetch
 * failed` and puts the real reason on `cause`, sometimes nested. Without
 * unwrapping it, a backend that answered a moment too late is reported to the
 * user as a backend that is down — which sends them to check a service that is
 * running perfectly, and hides the fact that their answer was nearly ready.
 *
 * The 300-second limit that produces `HeadersTimeoutError` here is Node's own
 * and cannot be raised from a route handler, so naming it accurately is the
 * only honest option available. See `AI_TIMEOUT_SECONDS` in docs/ENVIRONMENT.md
 * for the budget that keeps requests underneath it.
 */

const TIMEOUT_NAMES = new Set([
  "HeadersTimeoutError",
  "BodyTimeoutError",
  "ConnectTimeoutError",
  "TimeoutError",
]);

/** How far to follow `cause` before giving up, in case a chain loops. */
const MAX_DEPTH = 5;

export function isTimeoutError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < MAX_DEPTH; depth += 1) {
    if (!(current instanceof Error)) return false;
    if (TIMEOUT_NAMES.has(current.name)) return true;
    if (current.cause === undefined || current.cause === null) return false;
    current = current.cause;
  }
  return false;
}
