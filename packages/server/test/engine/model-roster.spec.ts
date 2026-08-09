import { describe, expect, test } from "vitest";
import type { StaticModelRoster } from "@adhd/core";
import { mergeModelLayers } from "../../src/domain/rules/model-roster.ts";

const BUNDLED: StaticModelRoster = {
  checkedOn: "2026-08-07",
  options: [
    { id: "gpt-5.6-sol", label: "GPT-5.6 Sol", hint: "most capable" },
    { id: "gpt-5.6-luna", label: "GPT-5.6 Luna", hint: "faster, cheaper" },
  ],
};

function originOf(options: { id: string; origin: string }[], id: string): string | undefined {
  return options.find((option) => option.id === id)?.origin;
}

describe("mergeModelLayers", () => {
  test("Auto leads every roster, though no layer offers it", () => {
    const roster = mergeModelLayers({ engine: "codex", live: [], bundled: BUNDLED });

    expect(roster.options[0]).toEqual({
      id: "",
      label: "Auto",
      hint: "use the CLI's own configured default",
      origin: "auto",
    });
  });

  test("an id only the bundled list knows is marked unverified", () => {
    const roster = mergeModelLayers({ engine: "codex", live: [], bundled: BUNDLED });

    expect(originOf(roster.options, "gpt-5.6-sol")).toBe("static");
  });

  test("an id the CLI listed outranks the same id in the bundled list", () => {
    const live = [{ id: "gpt-5.6-sol", label: "GPT-5.6 Sol", hint: "" }];

    const roster = mergeModelLayers({ engine: "codex", live, bundled: BUNDLED });

    expect(roster.options.filter((option) => option.id === "gpt-5.6-sol")).toEqual([
      { id: "gpt-5.6-sol", label: "GPT-5.6 Sol", hint: "", origin: "live" },
    ]);
  });

  test("the model the user's own CLI is configured for counts as verified", () => {
    const configured = { id: "gpt-5.6-sol", label: "gpt-5.6-sol", hint: "from your config" };

    const roster = mergeModelLayers({ engine: "codex", live: [], configured, bundled: BUNDLED });

    expect(originOf(roster.options, "gpt-5.6-sol")).toBe("config");
  });

  test("a configured id the bundled list also knows appears once", () => {
    const configured = { id: "gpt-5.6-sol", label: "gpt-5.6-sol", hint: "from your config" };

    const roster = mergeModelLayers({ engine: "codex", live: [], configured, bundled: BUNDLED });

    expect(roster.options.map((option) => option.id)).toEqual(["", "gpt-5.6-sol", "gpt-5.6-luna"]);
  });

  test("the roster carries the date its bundled list was last checked", () => {
    const roster = mergeModelLayers({ engine: "codex", live: [], bundled: BUNDLED });

    expect(roster.staticCheckedOn).toBe("2026-08-07");
  });
});
