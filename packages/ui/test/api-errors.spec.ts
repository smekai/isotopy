// Unit spec: the server answers a rejected schedule with a generic `error` plus a
// per-field `issues` array, and only the issues say what to change. Dropping them
// leaves a dialog reading "Invalid request" over a cron expression nobody can fix.
import { describe, expect, test } from "vitest";
import { failureMessage } from "../src/api";

describe("failureMessage", () => {
  test("prefers the field-level issues, which are the only actionable part", () => {
    expect(
      failureMessage({
        error: "Invalid request",
        issues: [{ message: "Mars/Olympus is not an IANA time zone" }],
      }),
    ).toBe("Mars/Olympus is not an IANA time zone");
  });

  test("joins several issues rather than showing only the first", () => {
    expect(
      failureMessage({ issues: [{ message: "bad cron" }, { message: "bad zone" }] }),
    ).toBe("bad cron; bad zone");
  });

  test("falls back to the generic error when a failure carries no issues", () => {
    expect(failureMessage({ error: "Unknown schedule" })).toBe("Unknown schedule");
  });

  test("an empty issues array is not a message, so the generic error still shows", () => {
    expect(failureMessage({ error: "Invalid request", issues: [] })).toBe("Invalid request");
  });
});
