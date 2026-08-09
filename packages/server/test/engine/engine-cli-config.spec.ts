import { describe, expect, test } from "vitest";
import {
  claudeSettingsModel,
  codexConfigModel,
  cursorCliConfigModel,
  parseCursorModels,
} from "../../src/schemas/engine-cli-config.ts";

// Verbatim head of a real ~/.codex/config.toml: the root table names the model,
// and a profile further down names a different one.
const CODEX_CONFIG = [
  'model = "gpt-5.6-sol"',
  "model_reasoning_effort = \"high\"",
  "",
  "[profiles.fast]",
  'model = "gpt-5.6-luna"',
].join("\n");

// Verbatim head of `agent models`, including the bare header line.
const CURSOR_MODELS = [
  "Available models",
  "",
  "auto - Auto (current, default)",
  "composer-2.5 - Composer 2.5",
  "claude-opus-5-thinking-high - Opus 5 1M Thinking",
].join("\n");

describe("codexConfigModel", () => {
  test("reads the model named in the root table", () => {
    expect(codexConfigModel(CODEX_CONFIG)).toBe("gpt-5.6-sol");
  });

  test("ignores a model belonging to a profile rather than the CLI itself", () => {
    const profileOnly = ["[profiles.fast]", 'model = "gpt-5.6-luna"'].join("\n");

    expect(codexConfigModel(profileOnly)).toBeUndefined();
  });

  test("accepts single quotes", () => {
    expect(codexConfigModel("model = 'gpt-5.6-luna'")).toBe("gpt-5.6-luna");
  });

  test("reads a file written with Windows line endings", () => {
    expect(codexConfigModel('\r\nmodel = "gpt-5.6-sol"\r\n')).toBe("gpt-5.6-sol");
  });

  test("a config that names no model yields nothing", () => {
    expect(codexConfigModel('model_reasoning_effort = "high"')).toBeUndefined();
  });
});

describe("claudeSettingsModel", () => {
  test("reads the model beside unrelated settings", () => {
    const settings = '{"permissions":{"allow":[]},"model":"opus","theme":"dark"}';

    expect(claudeSettingsModel(settings)).toBe("opus");
  });

  test("settings that name no model yield nothing", () => {
    expect(claudeSettingsModel('{"theme":"dark"}')).toBeUndefined();
  });

  test("a model of the wrong type yields nothing rather than throwing", () => {
    expect(claudeSettingsModel('{"model":7}')).toBeUndefined();
  });

  test("malformed JSON yields nothing rather than throwing", () => {
    expect(claudeSettingsModel("{not json")).toBeUndefined();
  });
});

describe("cursorCliConfigModel", () => {
  test("reads the display id from the object the CLI writes", () => {
    const config = '{"model":{"modelId":"default","displayModelId":"auto","displayName":"Auto"}}';

    expect(cursorCliConfigModel(config)).toBe("auto");
  });

  test("the routing sentinel is not a model the user chose", () => {
    expect(cursorCliConfigModel('{"model":{"modelId":"default"}}')).toBeUndefined();
  });

  test("reads a model written as a plain string", () => {
    expect(cursorCliConfigModel('{"model":"composer-2.5"}')).toBe("composer-2.5");
  });

  test("a config that names no model yields nothing", () => {
    expect(cursorCliConfigModel('{"permissions":{"allow":[]}}')).toBeUndefined();
  });
});

describe("parseCursorModels", () => {
  test("reads every listed id past the header line", () => {
    expect(parseCursorModels(CURSOR_MODELS).map((option) => option.id)).toEqual([
      "auto",
      "composer-2.5",
      "claude-opus-5-thinking-high",
    ]);
  });

  test("the CLI's current default is marked and its suffix stripped from the label", () => {
    const [current] = parseCursorModels(CURSOR_MODELS);

    expect(current).toEqual({ id: "auto", label: "Cursor Auto", hint: "the CLI's current default" });
  });

  test("output with no listing lines yields nothing", () => {
    expect(parseCursorModels("Available models\n\n")).toEqual([]);
  });
});
