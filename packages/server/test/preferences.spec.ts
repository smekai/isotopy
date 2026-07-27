// The settings file is hand-editable and predates the preference block, so a
// read has to survive anything; a write is the API contract and must not.
import { describe, expect, test } from "vitest";
import { defaultProjectPreferences } from "@adhd/core";
import {
  normalizeProjectPreferences,
  parsePreferencesUpdate,
} from "../src/domain/preferences.ts";

describe("normalizeProjectPreferences", () => {
  test("an absent block reads as the built-in defaults", () => {
    expect(normalizeProjectPreferences(undefined)).toEqual(defaultProjectPreferences());
  });

  test("junk in every field falls back field by field", () => {
    expect(
      normalizeProjectPreferences({
        engine: "not-an-engine",
        engineModels: "nope",
        permissionMode: "yolo",
        pipelineId: "no-such-pipeline",
      }),
    ).toEqual(defaultProjectPreferences());
  });

  test("known values survive", () => {
    expect(
      normalizeProjectPreferences({
        engine: "codex",
        engineModels: { codex: "gpt-5.1-codex-max" },
        permissionMode: "acceptEdits",
        pipelineId: "solo",
      }),
    ).toEqual({
      engine: "codex",
      engineModels: { codex: "gpt-5.1-codex-max" },
      permissionMode: "acceptEdits",
      pipelineId: "solo",
    });
  });

  test("a legacy model id migrates to its CLI alias", () => {
    const preferences = normalizeProjectPreferences({
      engineModels: { "claude-code": "claude-sonnet-4-6" },
    });

    expect(preferences.engineModels["claude-code"]).toBe("sonnet");
  });

  test("an unknown engine key is dropped from the model bag", () => {
    const preferences = normalizeProjectPreferences({
      engineModels: { "claude-code": "opus", gemini: "pro" },
    });

    expect(preferences.engineModels).toEqual({ "claude-code": "opus" });
  });
});

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
