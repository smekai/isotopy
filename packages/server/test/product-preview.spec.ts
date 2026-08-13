import { describe, expect, test } from "vitest";
import { framingVerdict, readyPollIntervalMs } from "../src/domain/rules/product-preview.ts";

describe("framingVerdict", () => {
  test("a dev server that sets no framing headers can be shown in the preview", () => {
    expect(framingVerdict({})).toEqual({ allowed: true });
  });

  test("SAMEORIGIN blocks Isotopy, which is never the same origin as the product", () => {
    expect(framingVerdict({ xFrameOptions: "SAMEORIGIN" })).toEqual({
      allowed: false,
      blockedBy: "X-Frame-Options: SAMEORIGIN",
    });
  });

  test("the header value is matched case-insensitively, as browsers match it", () => {
    expect(framingVerdict({ xFrameOptions: " deny " }).allowed).toBe(false);
  });

  test("an obsolete ALLOW-FROM is ignored rather than read as a refusal, because browsers ignore it", () => {
    expect(framingVerdict({ xFrameOptions: "ALLOW-FROM https://example.test" })).toEqual({
      allowed: true,
    });
  });

  test("frame-ancestors is found among other directives rather than only at the start", () => {
    expect(
      framingVerdict({
        contentSecurityPolicy: "default-src 'self'; frame-ancestors 'none'; img-src *",
      }),
    ).toEqual({ allowed: false, blockedBy: "Content-Security-Policy: frame-ancestors 'none'" });
  });

  test("frame-ancestors * permits the preview", () => {
    expect(framingVerdict({ contentSecurityPolicy: "frame-ancestors *" })).toEqual({
      allowed: true,
    });
  });

  test("a policy without frame-ancestors says nothing about framing", () => {
    expect(framingVerdict({ contentSecurityPolicy: "default-src 'self'" })).toEqual({
      allowed: true,
    });
  });

  test("a frame-src directive is not mistaken for frame-ancestors", () => {
    expect(framingVerdict({ contentSecurityPolicy: "frame-src 'none'" })).toEqual({
      allowed: true,
    });
  });

  test("X-Frame-Options is reported ahead of CSP when both refuse", () => {
    expect(
      framingVerdict({ xFrameOptions: "DENY", contentSecurityPolicy: "frame-ancestors 'none'" })
        .blockedBy,
    ).toBe("X-Frame-Options: DENY");
  });
});

describe("readyPollIntervalMs", () => {
  test("a short readiness budget still polls often enough to notice, not once", () => {
    expect(readyPollIntervalMs(1000)).toBe(250);
  });

  test("a long readiness budget is capped so the preview is not left waiting on a slow tick", () => {
    expect(readyPollIntervalMs(600_000)).toBe(2000);
  });

  test("the default sixty-second budget spreads across attempts rather than hitting a bound", () => {
    expect(readyPollIntervalMs(20_000)).toBe(1000);
  });
});
