import { expect, test } from "vitest";
import { retryDelays } from "../src/utils/backoff.ts";

const MINUTE = 60_000;

test("a fixed backoff waits the same interval before every attempt", () => {
  expect(retryDelays({ attempts: 3, everyMs: MINUTE, backoff: "fixed" })).toEqual([
    MINUTE,
    MINUTE,
    MINUTE,
  ]);
});

test("a linear backoff adds one interval per attempt", () => {
  expect(retryDelays({ attempts: 3, everyMs: MINUTE, backoff: "linear" })).toEqual([
    MINUTE,
    2 * MINUTE,
    3 * MINUTE,
  ]);
});

test("an exponential backoff doubles until it reaches its ceiling", () => {
  expect(
    retryDelays({ attempts: 5, everyMs: MINUTE, backoff: "exponential", maxEveryMs: 5 * MINUTE }),
  ).toEqual([MINUTE, 2 * MINUTE, 4 * MINUTE, 5 * MINUTE, 5 * MINUTE]);
});

test("attempts that would end past the overall timeout are dropped", () => {
  expect(
    retryDelays({ attempts: 10, everyMs: MINUTE, backoff: "exponential", timeoutMs: 10 * MINUTE }),
  ).toEqual([MINUTE, 2 * MINUTE, 4 * MINUTE]);
});

test("a timeout shorter than the first interval leaves no attempt at all", () => {
  expect(retryDelays({ attempts: 3, everyMs: 5 * MINUTE, backoff: "fixed", timeoutMs: MINUTE })).toEqual([]);
});
