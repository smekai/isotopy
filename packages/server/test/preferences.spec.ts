// A write is the API contract: `parsePreferencesUpdate` validates four
// independent fields, returns a partial update of only what was sent, and
// rewrites legacy model ids on the way in. That branching is what this covers.
//
// `normalizeProjectPreferences` is deliberately not covered here — it is four
// `isValid(x) ? x : default` ternaries, and its one piece of real logic (the
// legacy alias rewrite in `readEngineModels`) is shared with the parser below.
import { describe, expect, test } from "vitest";
import { parsePreferencesUpdate } from "../src/domain/preferences.ts";

describe("parsePreferencesUpdate", () => {
  test("an empty body is a valid no-op update", () => {
    expect(parsePreferencesUpdate({})).toEqual({ ok: true, update: {} });
  });

  test("only the fields present are returned", () => {
    expect(parsePreferencesUpdate({ pipelineId: "pm-dev-test" })).toEqual({
      ok: true,
      update: { pipelineId: "pm-dev-test" },
    });
  });

  test("an unknown engine is rejected", () => {
    expect(parsePreferencesUpdate({ engine: "gemini" })).toEqual({
      ok: false,
      error: "Unknown engine: gemini",
    });
  });

  test("an unknown permission mode is rejected", () => {
    expect(parsePreferencesUpdate({ permissionMode: "yolo" }).ok).toBe(false);
  });

  test("an unknown pipeline is rejected", () => {
    expect(parsePreferencesUpdate({ pipelineId: "no-such-pipeline" }).ok).toBe(false);
  });

  test("an unknown engine in the model bag is rejected", () => {
    expect(parsePreferencesUpdate({ engineModels: { gemini: "pro" } }).ok).toBe(false);
  });

  test("a legacy model id is accepted and migrated on the way in", () => {
    expect(
      parsePreferencesUpdate({ engineModels: { "claude-code": "claude-opus-4-8" } }),
    ).toEqual({ ok: true, update: { engineModels: { "claude-code": "opus" } } });
  });
});
