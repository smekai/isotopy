// The persisted log format, which changes more often than anything else in the
// run model. `stageLogEntrySchema` is strict, so a field added to the entry and
// forgotten here fails every reload of the history that carries one — silently,
// and only for users who already have runs on disk.
import { describe, expect, it } from "vitest";
import { stageLogEntrySchema } from "../src/runs.ts";

const TS = "2026-08-03T10:00:00.000Z";

describe("stageLogEntrySchema", () => {
  it("round-trips an entry carrying a declared activity", () => {
    const entry = {
      ts: TS,
      level: "run",
      message: "▶ Read src/index.ts",
      activity: { kind: "tool", name: "Read", detail: "src/index.ts" },
    };

    const parsed = stageLogEntrySchema.safeParse(entry);

    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual(entry);
  });

  it("still reads an entry written before activities existed", () => {
    const parsed = stageLogEntrySchema.safeParse({
      ts: TS,
      level: "run",
      message: "▶ Read src/index.ts",
    });

    expect(parsed.success).toBe(true);
  });
});
