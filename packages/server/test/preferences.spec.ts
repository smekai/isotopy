// A write is the API contract: the boundary schema validates four
// independent fields, returns a partial update of only what was sent, and
// rewrites legacy model ids on the way in. That branching is what this covers.
//
// `normalizeProjectPreferences` is deliberately not covered here — it is four
// `isValid(x) ? x : default` ternaries, and its one piece of real logic (the
// legacy alias rewrite in `readEngineModels`) is shared with the parser below.
import { describe, expect, test } from "vitest";
import { projectPreferencesUpdateSchema } from "../src/schemas/request-schemas.ts";

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

  test("unknown top-level fields are rejected", () => {
    expect(parse({ pipelineId: "solo", typo: true }).ok).toBe(false);
  });
});
