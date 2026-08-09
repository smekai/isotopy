import { describe, expect, test } from "vitest";
import { resolveTier, rosterOrigins } from "../src/engines.ts";
import type { EngineModelOption, EngineModelRoster } from "../src/engines.ts";

function option(id: string, origin: EngineModelOption["origin"]): EngineModelOption {
  return { id, label: id, hint: "", origin };
}

function rosterOf(...ids: string[]): EngineModelRoster {
  return {
    engine: "claude-code",
    options: ids.map((id) => option(id, "live")),
    staticCheckedOn: "2026-08-07",
  };
}

describe("rosterOrigins", () => {
  test("names each layer that contributed, once", () => {
    const options = [option("a", "live"), option("b", "live"), option("c", "static")];

    expect(rosterOrigins(options)).toEqual(["live", "static"]);
  });

  test("orders them from most to least authoritative, whatever order they appear in", () => {
    const options = [option("a", "static"), option("b", "config"), option("c", "live")];

    expect(rosterOrigins(options)).toEqual(["live", "config", "static"]);
  });

  test("Auto is not a layer — it is offered whether or not anything was resolved", () => {
    const options = [option("", "auto"), option("a", "static")];

    expect(rosterOrigins(options)).toEqual(["static"]);
  });
});

describe("resolveTier", () => {
  test("a preset resolves to a model and the effort that goes with it", () => {
    expect(resolveTier("claude-code", "deep", rosterOf("opus", "sonnet"))).toEqual({
      tier: "deep",
      model: "opus",
      effort: "high",
      degraded: false,
    });
  });

  test("a rung the harness has retired falls through to the next candidate", () => {
    expect(resolveTier("claude-code", "deep", rosterOf("sonnet"))).toEqual({
      tier: "deep",
      model: "sonnet",
      effort: "high",
      degraded: false,
    });
  });

  test("a ladder the harness offers nothing from degrades to its own default", () => {
    expect(resolveTier("claude-code", "deep", rosterOf("haiku"))).toEqual({
      tier: "deep",
      model: "",
      degraded: true,
    });
  });

  test("Auto asks for nothing, so it can never degrade", () => {
    expect(resolveTier("claude-code", "auto", rosterOf())).toEqual({
      tier: "auto",
      model: "",
      degraded: false,
    });
  });
});
