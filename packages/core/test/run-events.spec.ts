import { describe, expect, it } from "vitest";
import { RUN_EVENT_TYPES, runEventSchema } from "../src/run-events.ts";

const TS = "2026-08-03T10:00:00.000Z";
const RUN_ID = "run-1";

describe("RUN_EVENT_TYPES", () => {
  it("names exactly the arms the union carries, because it is derived from them", () => {
    expect([...RUN_EVENT_TYPES].sort()).toEqual(
      runEventSchema.options.map((arm) => arm.shape.type.value).sort(),
    );
  });

  it("still lists the fifteen the SSE transport subscribes to", () => {
    expect(RUN_EVENT_TYPES).toHaveLength(15);
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

describe("arm invariants the reducer is allowed to rely on", () => {
  it("rejects a stage.log with no level", () => {
    const parsed = runEventSchema.safeParse({
      ts: TS,
      runId: RUN_ID,
      type: "stage.log",
      stageId: "developer",
      message: "building",
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects a stage.blocked that carries no limit", () => {
    const parsed = runEventSchema.safeParse({
      ts: TS,
      runId: RUN_ID,
      type: "stage.blocked",
      stageId: "developer",
      status: "blocked",
      message: "waiting",
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects a run.completed still claiming to be running", () => {
    const parsed = runEventSchema.safeParse({
      ts: TS,
      runId: RUN_ID,
      type: "run.completed",
      status: "running",
      message: "done",
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects an unknown event type", () => {
    const parsed = runEventSchema.safeParse({
      ts: TS,
      runId: RUN_ID,
      type: "stage.exploded",
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects an extra key on an otherwise valid arm", () => {
    const parsed = runEventSchema.safeParse({
      ts: TS,
      runId: RUN_ID,
      type: "stage.started",
      stageId: "developer",
      status: "running",
      mood: "brisk",
    });

    expect(parsed.success).toBe(false);
  });
});
