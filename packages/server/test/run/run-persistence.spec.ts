import { describe, expect, test } from "vitest";
import {
  parsePersistedRun,
  parsePersistedRunEvent,
} from "../../src/domain/codecs/run-persistence.ts";
import { makePersistedRun, makeRunEvent } from "../support/run-fixtures.ts";

function json(value: unknown): string {
  return JSON.stringify(value);
}

describe("persisted run schema", () => {
  test("accepts a complete current run", () => {
    const parsed = parsePersistedRun(json(makePersistedRun("run-1", "running")));

    expect(parsed).toMatchObject({
      ok: true,
      value: { run: { id: "run-1", messages: [] } },
    });
  });

  test("rejects records from an older shape instead of migrating them", () => {
    const persisted = makePersistedRun("legacy", "completed");
    const legacy = {
      ...persisted,
      run: {
        ...persisted.run,
        messages: undefined,
      },
    };

    const parsed = parsePersistedRun(json(legacy));

    expect(parsed).toMatchObject({
      ok: false,
      issues: [{ path: ["run", "messages"] }],
    });
  });

  test("rejects a malformed nested field instead of dropping it", () => {
    const persisted = makePersistedRun("broken", "running");
    const malformed = {
      ...persisted,
      run: {
        ...persisted.run,
        stages: [
          {
            id: "test",
            label: "QA",
            status: "running",
            logs: [{ ts: "now", level: "pass", message: 7 }],
          },
        ],
      },
    };

    const parsed = parsePersistedRun(json(malformed));

    expect(parsed).toMatchObject({
      ok: false,
      issues: [{ path: ["run", "stages", 0, "logs", 0, "message"] }],
    });
  });

  test("rejects unknown persisted fields", () => {
    const persisted = {
      ...makePersistedRun("unknown", "running"),
      accidentalCompatibilityField: true,
    };

    const parsed = parsePersistedRun(json(persisted));

    expect(parsed.ok).toBe(false);
  });

  test("does not treat an invalid messages value as a legacy record", () => {
    const persisted = makePersistedRun("broken-messages", "running");
    const malformed = {
      ...persisted,
      run: { ...persisted.run, messages: "not-an-array" },
    };

    const parsed = parsePersistedRun(json(malformed));

    expect(parsed).toMatchObject({
      ok: false,
      issues: [{ path: ["run", "messages"] }],
    });
  });
});

describe("persisted run event schema", () => {
  test("accepts a complete event", () => {
    expect(parsePersistedRunEvent(json(makeRunEvent("run-1")))).toMatchObject({
      ok: true,
      value: { type: "run.started", runId: "run-1" },
    });
  });

  test("rejects a malformed known event with its nested path", () => {
    const parsed = parsePersistedRunEvent(
      json({
        ts: "2026-07-29T00:00:00.000Z",
        type: "stage.usage",
        runId: "run-1",
        stageId: "test",
        usage: { tokensOut: "many" },
      }),
    );

    expect(parsed).toMatchObject({
      ok: false,
      issues: [{ path: ["usage", "tokensOut"] }],
    });
  });

  test("rejects unknown event types", () => {
    const parsed = parsePersistedRunEvent(
      json({
        ts: "2026-07-29T00:00:00.000Z",
        type: "stage.maybe",
        runId: "run-1",
      }),
    );

    expect(parsed.ok).toBe(false);
  });
});
