import { describe, expect, it } from "vitest";
import {
  runLimitSchema,
  runMessageSchema,
  stageLogEntrySchema,
  stageUsageSchema,
} from "../src/runs.ts";

describe("stageUsageSchema", () => {
  it("accepts a partial report, because engines each know a different half", () => {
    const parsed = stageUsageSchema.safeParse({ costUsd: 0.42, turns: 3 });

    expect(parsed.success).toBe(true);
  });

  it("rejects a negative cost", () => {
    const parsed = stageUsageSchema.safeParse({ costUsd: -1 });

    expect(parsed.success).toBe(false);
  });

  it("rejects a fractional token count", () => {
    const parsed = stageUsageSchema.safeParse({ tokensIn: 1.5 });

    expect(parsed.success).toBe(false);
  });
});

describe("runLimitSchema", () => {
  const limit = {
    stageId: "developer",
    engine: "claude-code",
    raw: "5-hour limit reached",
    detectedAt: "2026-08-03T10:00:00.000Z",
    attempt: 1,
  };

  it("accepts a limit with no known reset time", () => {
    expect(runLimitSchema.safeParse(limit).success).toBe(true);
  });

  it("rejects a limit with no detectedAt", () => {
    const { detectedAt: _detectedAt, ...withoutDetectedAt } = limit;

    expect(runLimitSchema.safeParse(withoutDetectedAt).success).toBe(false);
  });

  it("rejects an attempt count of zero, since detection is the first attempt", () => {
    expect(runLimitSchema.safeParse({ ...limit, attempt: 0 }).success).toBe(false);
  });

  it("rejects an unknown engine", () => {
    expect(runLimitSchema.safeParse({ ...limit, engine: "gpt" }).success).toBe(false);
  });
});

describe("runMessageSchema", () => {
  const message = {
    id: "m1",
    ts: "2026-08-03T10:00:00.000Z",
    role: "user",
    text: "please retry",
  };

  it("accepts a message with no stage or kind", () => {
    expect(runMessageSchema.safeParse(message).success).toBe(true);
  });

  it("rejects an unknown key", () => {
    expect(runMessageSchema.safeParse({ ...message, author: "fedor" }).success).toBe(false);
  });

  it("rejects an unknown role", () => {
    expect(runMessageSchema.safeParse({ ...message, role: "system" }).success).toBe(false);
  });
});

describe("stageLogEntrySchema", () => {
  it("accepts an empty message, since an engine may emit a blank line", () => {
    const parsed = stageLogEntrySchema.safeParse({
      ts: "2026-08-03T10:00:00.000Z",
      level: "info",
      message: "",
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects an unknown level", () => {
    const parsed = stageLogEntrySchema.safeParse({
      ts: "2026-08-03T10:00:00.000Z",
      level: "debug",
      message: "hi",
    });

    expect(parsed.success).toBe(false);
  });

  // The schema is strict, so a declared activity that it did not know about
  // would fail every reload of the history that carries one.
  it("round-trips a log entry carrying a declared activity", () => {
    const entry = {
      ts: "2026-08-03T10:00:00.000Z",
      level: "run",
      message: "▶ Read src/index.ts",
      activity: { kind: "tool", name: "Read", detail: "src/index.ts" },
    };

    const parsed = stageLogEntrySchema.safeParse(entry);

    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual(entry);
  });

  it("still accepts a log entry written before activities existed", () => {
    const parsed = stageLogEntrySchema.safeParse({
      ts: "2026-08-03T10:00:00.000Z",
      level: "run",
      message: "▶ Read src/index.ts",
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects an activity of an unknown kind", () => {
    const parsed = stageLogEntrySchema.safeParse({
      ts: "2026-08-03T10:00:00.000Z",
      level: "run",
      message: "hi",
      activity: { kind: "telepathy", name: "Read" },
    });

    expect(parsed.success).toBe(false);
  });
});
