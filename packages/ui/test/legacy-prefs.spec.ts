// Preferences moved to the server in TASK-065. A browser that predates the move
// still holds `adhd.<projectId>.<name>` keys, and the app adopts them once — so
// what this covers is the read-then-forget, including the junk a hand-edited or
// half-written storage can hold.
import { beforeEach, describe, expect, test } from "vitest";
import { HOME_PROJECT_ID } from "@adhd/core";
import { clearLegacyPreferences, readLegacyPreferences } from "../src/legacy-prefs";

class MemoryStorage {
  private readonly entries = new Map<string, string>();

  getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.entries.set(key, value);
  }

  removeItem(key: string): void {
    this.entries.delete(key);
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

function store(projectId: string, name: string, value: string): void {
  storage.setItem(`adhd.${projectId}.${name}`, value);
}

describe("readLegacyPreferences", () => {
  test("an untouched browser has nothing to adopt", () => {
    expect(readLegacyPreferences(ALPHA)).toBeNull();
  });

  test("every stored preference is collected into one update", () => {
    store(ALPHA, "engine", "codex");
    store(ALPHA, "engineModel.codex", "gpt-5.1-codex-max");
    store(ALPHA, "permissionMode", "acceptEdits");
    store(ALPHA, "pipelineId", "solo");

    expect(readLegacyPreferences(ALPHA)).toEqual({
      engine: "codex",
      engineModels: { codex: "gpt-5.1-codex-max" },
      permissionMode: "acceptEdits",
      pipelineId: "solo",
    });
  });

  test("a partially configured project yields only the keys it has", () => {
    store(ALPHA, "pipelineId", "solo");

    expect(readLegacyPreferences(ALPHA)).toEqual({ pipelineId: "solo" });
  });

  test("another project's keys are not adopted", () => {
    store(BETA, "engine", "codex");

    expect(readLegacyPreferences(ALPHA)).toBeNull();
  });

  test("the home project is scoped like any other", () => {
    store(HOME_PROJECT_ID, "pipelineId", "solo");

    expect(readLegacyPreferences(HOME_PROJECT_ID)).toEqual({ pipelineId: "solo" });
  });

  test("values the server would reject are dropped rather than sent", () => {
    store(ALPHA, "engine", "not-an-engine");
    store(ALPHA, "permissionMode", "yolo");
    store(ALPHA, "pipelineId", "no-such-pipeline");

    expect(readLegacyPreferences(ALPHA)).toBeNull();
  });

  test("a legacy model id is adopted as stored — the server migrates it", () => {
    store(ALPHA, "engineModel.claude-code", "claude-sonnet-4-6");

    expect(readLegacyPreferences(ALPHA)).toEqual({
      engineModels: { "claude-code": "claude-sonnet-4-6" },
    });
  });
});

describe("clearLegacyPreferences", () => {
  test("adoption happens once — the keys are gone afterwards", () => {
    store(ALPHA, "engine", "codex");
    store(ALPHA, "engineModel.codex", "gpt-5.1-codex-max");
    store(ALPHA, "pipelineId", "solo");

    clearLegacyPreferences(ALPHA);

    expect(storage.keys()).toEqual([]);
    expect(readLegacyPreferences(ALPHA)).toBeNull();
  });

  test("only the named project is cleared", () => {
    store(ALPHA, "engine", "codex");
    store(BETA, "engine", "cursor");

    clearLegacyPreferences(ALPHA);

    expect(storage.keys()).toEqual([`adhd.${BETA}.engine`]);
  });
});
