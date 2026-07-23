// Preferences are per project: switching projects must switch the pipeline,
// engine, model and permission mode with it, so no two projects may share a key.
import { beforeEach, describe, expect, test } from "vitest";
import { HOME_PROJECT_ID } from "@adhd/core";
import {
  loadDisabledStages,
  loadEngine,
  loadEngineModel,
  loadPermissionMode,
  loadPipelineId,
  prefKey,
  saveDisabledStages,
  saveEngine,
  saveEngineModel,
  savePermissionMode,
  savePipelineId,
} from "../src/settings";

class MemoryStorage {
  private readonly entries = new Map<string, string>();

  getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.entries.set(key, value);
  }

  keys(): string[] {
    return [...this.entries.keys()];
  }
}

const ALPHA = "alpha-1234abcd";
const BETA = "beta-5678ef01";

let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
});

describe("preference keys", () => {
  test("carry the project id", () => {
    expect(prefKey(ALPHA, "pipelineId")).toBe(`adhd.${ALPHA}.pipelineId`);
  });

  test("two projects writing the same preference produce two keys", () => {
    savePipelineId(ALPHA, "dev-test");
    savePipelineId(BETA, "one-box");

    expect(storage.keys()).toEqual([
      `adhd.${ALPHA}.pipelineId`,
      `adhd.${BETA}.pipelineId`,
    ]);
  });
});

describe("per-project isolation", () => {
  test("the pipeline choice does not cross projects", () => {
    savePipelineId(ALPHA, "dev-test");

    expect(loadPipelineId(ALPHA)).toBe("dev-test");
    expect(loadPipelineId(BETA)).toBe("sequential");
  });

  test("the engine and its model do not cross projects", () => {
    saveEngine(ALPHA, "codex");
    saveEngineModel(ALPHA, "codex", "gpt-5.1-codex-max");

    expect(loadEngine(ALPHA)).toBe("codex");
    expect(loadEngineModel(ALPHA, "codex")).toBe("gpt-5.1-codex-max");
    expect(loadEngine(BETA)).toBe("claude-code");
  });

  test("the permission mode does not cross projects", () => {
    savePermissionMode(ALPHA, "acceptEdits");

    expect(loadPermissionMode(ALPHA)).toBe("acceptEdits");
    expect(loadPermissionMode(BETA)).toBe("skip");
  });

  test("disabled stages do not cross projects", () => {
    saveDisabledStages(ALPHA, ["review", "deploy"]);

    expect(loadDisabledStages(ALPHA)).toEqual(["review", "deploy"]);
    expect(loadDisabledStages(BETA)).toEqual([]);
  });

  test("the home project is scoped like any other", () => {
    savePipelineId(HOME_PROJECT_ID, "one-box");

    expect(storage.keys()).toEqual([`adhd.${HOME_PROJECT_ID}.pipelineId`]);
    expect(loadPipelineId(HOME_PROJECT_ID)).toBe("one-box");
  });
});

describe("malformed storage", () => {
  test("a corrupt disabled-stages value reads as empty, not a crash", () => {
    storage.setItem(prefKey(ALPHA, "disabledStages"), "{not json");

    expect(loadDisabledStages(ALPHA)).toEqual([]);
  });

  test("an unknown engine id falls back to the default", () => {
    storage.setItem(prefKey(ALPHA, "engine"), "not-an-engine");

    expect(loadEngine(ALPHA)).toBe("claude-code");
  });
});
