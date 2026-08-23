// A write is the API contract: the boundary schema validates four
// independent fields, returns a partial update of only what was sent, and
// rewrites legacy model ids on the way in. That branching is what this covers.
//
// `normalizeProjectPreferences` is covered only where it stopped being a
// ternary: the tier fallback now depends on the stored engine, because the
// economical default differs per harness.
import { describe, expect, test } from "vitest";
import { normalizeProjectPreferences } from "../src/schemas/preferences.ts";
import { projectPreferencesUpdateSchema } from "../src/schemas/request-schemas.ts";

describe("normalizeProjectPreferences", () => {
  test("a pre-tier file adopts its own engine's economical default, not Claude Code's", () => {
    // A settings file written before presets existed has an engine and no tier.
    // Falling back to the default engine's tier hands Cursor `fast`, when the
    // cheap path on Cursor is its own routing — which `economy` is what names.
    expect(normalizeProjectPreferences({ engine: "cursor" }).modelTier).toBe("economy");
  });

  test("a stored tier still wins over the engine's default", () => {
    expect(normalizeProjectPreferences({ engine: "cursor", modelTier: "max" }).modelTier).toBe(
      "max",
    );
  });
});

function parse(input: unknown) {
  const result = projectPreferencesUpdateSchema.safeParse(input);
  return result.success ? { ok: true, update: result.data } : { ok: false };
}

describe("projectPreferencesUpdateSchema", () => {
  test("an empty body is a valid no-op update", () => {
    expect(parse({})).toEqual({ ok: true, update: {} });
  });

  test("only the fields present are returned", () => {
    expect(parse({ pipelineId: "pm-dev-test" })).toEqual({
      ok: true,
      update: { pipelineId: "pm-dev-test" },
    });
  });

  test("an unknown engine is rejected", () => {
    expect(parse({ engine: "gemini" })).toEqual({ ok: false });
  });

  test("an unknown permission mode is rejected", () => {
    expect(parse({ permissionMode: "yolo" }).ok).toBe(false);
  });

  test("an unknown pipeline is rejected", () => {
    expect(parse({ pipelineId: "no-such-pipeline" }).ok).toBe(false);
  });

  test("an unknown engine in the model bag is rejected", () => {
    expect(parse({ engineModels: { gemini: "pro" } }).ok).toBe(false);
  });

  test("a legacy model id is accepted and migrated on the way in", () => {
    expect(
      parse({ engineModels: { "claude-code": "claude-opus-4-8" } }),
    ).toEqual({ ok: true, update: { engineModels: { "claude-code": "opus" } } });
  });

  test("a Codex model a ChatGPT account rejects is migrated to Auto, not carried into a run", () => {
    expect(parse({ engineModels: { codex: "gpt-5-mini" } })).toEqual({
      ok: true,
      update: { engineModels: { codex: "" } },
    });
  });

  test("a Cursor model the CLI has retired is migrated to Auto rather than refusing a run", () => {
    expect(parse({ engineModels: { cursor: "composer-1" } })).toEqual({
      ok: true,
      update: { engineModels: { cursor: "" } },
    });
  });

  test("unknown top-level fields are rejected", () => {
    expect(parse({ pipelineId: "solo", typo: true }).ok).toBe(false);
  });
});
