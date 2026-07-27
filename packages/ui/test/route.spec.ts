// Unit spec: the hash carries the selected run, so a malformed or absent hash
// must degrade to home rather than producing a run id the server never had.
// Round-tripping matters because run ids reach the URL verbatim.
import { describe, expect, test } from "vitest";
import { HOME_ROUTE, parseRoute, routeHash, runRoute } from "../src/route";

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
});

describe("routeHash", () => {
  test("a run id needing escapes round-trips through the hash", () => {
    // The id reaches the URL verbatim, so encode and decode have to agree.
    const route = runRoute("a/b");
    expect(parseRoute(routeHash(route))).toEqual(route);
  });
});
