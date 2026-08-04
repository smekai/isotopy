// RUN_EVENT_TYPES is derived from the union's arms rather than hand-listed, and
// the UI subscribes to SSE one event name at a time off that list — a name the
// list loses is a channel the browser stops listening to. The stage/run
// asymmetry below is the one arm invariant nothing else pins down.
import { describe, expect, it } from "vitest";
import { RUN_EVENT_TYPES, runEventSchema } from "../src/run-events.ts";

const TS = "2026-08-03T10:00:00.000Z";
const RUN_ID = "run-1";

describe("RUN_EVENT_TYPES", () => {
  it("names exactly the arms the union carries", () => {
    expect([...RUN_EVENT_TYPES].sort()).toEqual(
      runEventSchema.options.map((arm) => arm.shape.type.value).sort(),
    );
  });
});

describe("the stage/run asymmetry", () => {
  it("accepts run.message without a stage, because chat is not always in one", () => {
    const parsed = runEventSchema.safeParse({
      ts: TS,
      runId: RUN_ID,
      type: "run.message",
      chatMessage: { id: "m1", ts: TS, role: "user", text: "hi" },
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects a stage event that names no stage", () => {
    const parsed = runEventSchema.safeParse({
      ts: TS,
      runId: RUN_ID,
      type: "stage.started",
      status: "running",
    });

    expect(parsed.success).toBe(false);
  });
});
