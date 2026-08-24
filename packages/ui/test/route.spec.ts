// Unit spec: the hash carries the selected run, so a malformed or absent hash
// must degrade to home rather than producing a run id the server never had.
// Round-tripping matters because run ids reach the URL verbatim.
import { describe, expect, test } from "vitest";
import {
  HOME_ROUTE,
  milestoneRoute,
  parseRoute,
  routeHash,
  runRoute,
  scheduleRoute,
} from "../src/route";

describe("parseRoute", () => {
  test("an empty hash is home", () => {
    expect(parseRoute("")).toEqual(HOME_ROUTE);
  });

  test("a run hash carries the run id", () => {
    expect(parseRoute("#/runs/ab12cd34")).toEqual({ kind: "run", runId: "ab12cd34" });
  });

  test("a trailing segment after the run id is ignored", () => {
    expect(parseRoute("#/runs/ab12cd34/anything")).toEqual({ kind: "run", runId: "ab12cd34" });
  });

  test("an unknown hash falls back to home rather than inventing a run", () => {
    expect(parseRoute("#/settings")).toEqual(HOME_ROUTE);
    expect(parseRoute("#/runs/")).toEqual(HOME_ROUTE);
  });

  test("a percent-encoded run id is decoded", () => {
    expect(parseRoute("#/runs/a%2Fb")).toEqual({ kind: "run", runId: "a/b" });
  });

  test("a milestone hash carries the milestone id", () => {
    expect(parseRoute("#/milestones/m1")).toEqual({
      kind: "milestone",
      milestoneId: "m1",
    });
  });

  test("an empty milestone id falls back to home", () => {
    expect(parseRoute("#/milestones/")).toEqual(HOME_ROUTE);
  });

  test("a schedule hash carries the schedule id", () => {
    expect(parseRoute("#/schedules/s1")).toEqual({ kind: "schedule", scheduleId: "s1" });
  });

  test("an empty schedule id falls back to home", () => {
    expect(parseRoute("#/schedules/")).toEqual(HOME_ROUTE);
  });
});

describe("routeHash", () => {
  test("a run id needing escapes round-trips through the hash", () => {
    // The id reaches the URL verbatim, so encode and decode have to agree.
    const route = runRoute("a/b");
    expect(parseRoute(routeHash(route))).toEqual(route);
  });

  test("a milestone id needing escapes round-trips through the hash", () => {
    const route = milestoneRoute("a/b");
    expect(parseRoute(routeHash(route))).toEqual(route);
  });

  test("a schedule id needing escapes round-trips through the hash", () => {
    const route = scheduleRoute("a/b");
    expect(parseRoute(routeHash(route))).toEqual(route);
  });

  test("home has no run or milestone segment", () => {
    expect(routeHash(HOME_ROUTE)).toBe("#/");
  });
});
