import { describe, expect, it } from "vitest";

import { isTimeoutError } from "@/lib/fetch-errors";

/**
 * This decides which of two sentences the user reads when a request fails:
 * "the service took too long" or "we could not reach the service". Getting it
 * wrong sends someone to restart a healthy backend, so it is pinned.
 */

function named(name: string, cause?: unknown): Error {
  const error = new Error("fetch failed", cause === undefined ? undefined : { cause });
  error.name = name;
  return error;
}

describe("isTimeoutError", () => {
  it("recognises the error Node actually throws at the 300s header limit", () => {
    // The shape observed in the dev server log: a plain TypeError wrapping the
    // undici error, which is where the real name lives.
    expect(isTimeoutError(named("TypeError", named("HeadersTimeoutError")))).toBe(true);
  });

  it.each([
    "HeadersTimeoutError",
    "BodyTimeoutError",
    "ConnectTimeoutError",
    "TimeoutError",
  ])("recognises %s at the top level", (name) => {
    expect(isTimeoutError(named(name))).toBe(true);
  });

  it("finds a timeout nested several causes deep", () => {
    const nested = named("TypeError", named("Error", named("BodyTimeoutError")));
    expect(isTimeoutError(nested)).toBe(true);
  });

  it("does not call a refused connection a timeout", () => {
    expect(isTimeoutError(named("TypeError", named("ECONNREFUSED")))).toBe(false);
  });

  it.each([
    ["a DNS failure", named("TypeError", named("ENOTFOUND"))],
    ["a bare fetch failure", named("TypeError")],
    ["a plain error", new Error("boom")],
  ])("does not treat %s as a timeout", (_label, error) => {
    expect(isTimeoutError(error)).toBe(false);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a string", "HeadersTimeoutError"],
    ["an object that merely looks like one", { name: "HeadersTimeoutError" }],
  ])("returns false for %s rather than throwing", (_label, value) => {
    expect(isTimeoutError(value)).toBe(false);
  });

  it("terminates on a cause chain that points at itself", () => {
    const looping = new Error("a");
    Object.defineProperty(looping, "cause", { get: () => looping });
    expect(isTimeoutError(looping)).toBe(false);
  });
});
