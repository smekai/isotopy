import { describe, expect, test } from "vitest";
import { CODEX_STATIC_MODELS, mergeModelLayers, resolveTier, rosterOrigins } from "../src/engines.ts";
import type { EngineModelOption, EngineModelRoster, ModelOptionDraft } from "../src/engines.ts";

const BUNDLED = CODEX_STATIC_MODELS;

function draft(id: string): ModelOptionDraft {
  return { id, label: id, hint: "" };
}

function originOf(roster: EngineModelRoster, id: string): string | undefined {
  return roster.options.find((option) => option.id === id)?.origin;
}

function rosterOf(...ids: string[]): EngineModelRoster {
  return {
    options: ids.map((id): EngineModelOption => ({ ...draft(id), origin: "live" })),
    staticCheckedOn: "2026-08-07",
  };
}

describe("mergeModelLayers", () => {
  test("Auto leads every roster, though no layer offers it", () => {
    const roster = mergeModelLayers({ live: [], bundled: BUNDLED });

    expect(roster.options[0]).toEqual({
      id: "",
      label: "Auto",
      hint: "use the CLI's own configured default",
      origin: "auto",
    });
  });

  test("an id only the bundled list knows is marked unverified", () => {
    const roster = mergeModelLayers({ live: [], bundled: BUNDLED });

    expect(originOf(roster, "gpt-5.6-sol")).toBe("static");
  });

  test("an id the CLI listed outranks the same id in the bundled list", () => {
    const roster = mergeModelLayers({ live: [draft("gpt-5.6-sol")], bundled: BUNDLED });

    expect(roster.options.filter((option) => option.id === "gpt-5.6-sol")).toEqual([
      { id: "gpt-5.6-sol", label: "gpt-5.6-sol", hint: "", origin: "live" },
    ]);
  });

  test("a configured id the bundled list also knows appears once, as verified", () => {
    const roster = mergeModelLayers({
      live: [],
      configured: draft("gpt-5.6-sol"),
      bundled: BUNDLED,
    });

    expect(roster.options.map((option) => option.id)).toEqual(["", "gpt-5.6-sol", "gpt-5.6-luna"]);
    expect(originOf(roster, "gpt-5.6-sol")).toBe("config");
  });
});

describe("rosterOrigins", () => {
  test("names each layer that contributed once, most authoritative first", () => {
    const roster = mergeModelLayers({
      live: [draft("a"), draft("b")],
      configured: draft("c"),
      bundled: BUNDLED,
    });

    expect(rosterOrigins(roster.options)).toEqual(["live", "config", "static"]);
  });

  test("Auto is not a layer — it is offered whether or not anything was resolved", () => {
    const roster = mergeModelLayers({ live: [], bundled: BUNDLED });

    expect(rosterOrigins(roster.options)).toEqual(["static"]);
  });
});

describe("resolveTier", () => {
  test("a preset resolves to a model and the effort that goes with it", () => {
    expect(resolveTier("claude-code", "deep", rosterOf("opus", "sonnet"))).toEqual({
      model: "opus",
      effort: "high",
      degraded: false,
    });
  });

  test("a rung the harness has retired falls through to the next candidate", () => {
    expect(resolveTier("claude-code", "deep", rosterOf("sonnet"))).toEqual({
      model: "sonnet",
      effort: "high",
      degraded: false,
    });
  });

  test("a ladder the harness offers nothing from degrades to its own default", () => {
    expect(resolveTier("claude-code", "deep", rosterOf("haiku"))).toEqual({
      model: "",
      degraded: true,
    });
  });

  test("Auto asks for nothing, so it can never degrade", () => {
    expect(resolveTier("claude-code", "auto", rosterOf())).toEqual({
      model: "",
      degraded: false,
    });
  });
});
