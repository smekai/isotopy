// Unit spec: applyEvent is the single place run state advances, and the live UI
// has no other way to notice it is wrong — a mis-mapped status or a swallowed
// log just renders a stale pipeline. The dedupe branch matters because the
// subscribe-before-snapshot ordering in useRunEvents deliberately replays events
// that the snapshot may already contain.
import { describe, expect, test } from "vitest";
import { applyEvent } from "../src/run-events";
import { event, message, run, stage, stageOf } from "./support/run-fixtures";

describe("applyEvent", () => {
  test("run.started puts the run back into running and clears the completion time", () => {
    const before = { ...run([stage("design")], "pending"), completedAt: "2026-07-21T11:00:00.000Z" };

    const after = applyEvent(before, event("run.started"));

    expect(after.status).toBe("running");
    expect(after.completedAt).toBeUndefined();
  });

  test("run.completed with a failed status carries that status through", () => {
    const after = applyEvent(run([stage("design")]), event("run.completed", { status: "failed" }));

    expect(after.status).toBe("failed");
  });

  test("run.completed preserves a needs-attention status", () => {
    const after = applyEvent(
      run([stage("design")]),
      event("run.completed", { status: "needs_attention" }),
    );

    expect(after.status).toBe("needs_attention");
  });

  test("run.completed with a cancelled status carries that status through", () => {
    const after = applyEvent(
      run([stage("design")]),
      event("run.completed", { status: "cancelled" }),
    );

    expect(after.status).toBe("cancelled");
  });

  test("run.completed with no status at all settles the run as completed", () => {
    const after = applyEvent(run([stage("design")]), event("run.completed"));

    expect(after.status).toBe("completed");
    expect(after.completedAt).toBe("2026-07-21T10:00:01.000Z");
  });

  test("run.completed stores the result when the event carries one", () => {
    const after = applyEvent(
      run([stage("design")]),
      event("run.completed", { result: "all green" }),
    );

    expect(after.result).toBe("all green");
  });

  test("stage.started marks the stage running and clears its completion time", () => {
    const before = run([{ ...stage("design", "failed"), completedAt: "2026-07-21T09:00:00.000Z" }]);

    const after = applyEvent(before, event("stage.started", { stageId: "design" }));

    expect(stageOf(after, "design").status).toBe("running");
    expect(stageOf(after, "design").startedAt).toBe("2026-07-21T10:00:01.000Z");
    expect(stageOf(after, "design").completedAt).toBeUndefined();
  });

  test("stage.log appends the entry and defaults its level to info", () => {
    const after = applyEvent(
      run([stage("design", "running")]),
      event("stage.log", { stageId: "design", message: "building" }),
    );

    expect(stageOf(after, "design").logs).toEqual([
      { ts: "2026-07-21T10:00:01.000Z", level: "info", message: "building" },
    ]);
  });

  test("stage.log keeps the level the event carries", () => {
    const after = applyEvent(
      run([stage("design", "running")]),
      event("stage.log", { stageId: "design", message: "broke", level: "error" }),
    );

    expect(stageOf(after, "design").logs[0]?.level).toBe("error");
  });

  test("a log entry replayed with the same timestamp and message is not duplicated", () => {
    const logged = event("stage.log", { stageId: "design", message: "building" });

    const after = applyEvent(applyEvent(run([stage("design", "running")]), logged), logged);

    expect(stageOf(after, "design").logs).toHaveLength(1);
  });

  test("the same message at a different timestamp is a separate entry", () => {
    const first = event("stage.log", { stageId: "design", message: "building" });
    const second = event("stage.log", {
      stageId: "design",
      message: "building",
      ts: "2026-07-21T10:00:02.000Z",
    });

    const after = applyEvent(applyEvent(run([stage("design", "running")]), first), second);

    expect(stageOf(after, "design").logs).toHaveLength(2);
  });

  test("a stage.log with no message is ignored", () => {
    const after = applyEvent(
      run([stage("design", "running")]),
      event("stage.log", { stageId: "design" }),
    );

    expect(stageOf(after, "design").logs).toEqual([]);
  });

  test("stage.completed passes the stage and stamps its completion time", () => {
    const after = applyEvent(
      run([stage("design", "running")]),
      event("stage.completed", { stageId: "design" }),
    );

    expect(stageOf(after, "design").status).toBe("passed");
    expect(stageOf(after, "design").completedAt).toBe("2026-07-21T10:00:01.000Z");
  });

  test("stage.failed fails the stage but leaves the run status to the run event", () => {
    const after = applyEvent(
      run([stage("design", "running")]),
      event("stage.failed", { stageId: "design" }),
    );

    expect(stageOf(after, "design").status).toBe("failed");
    expect(after.status).toBe("running");
  });

  test("stage.awaiting parks the run as well as the stage", () => {
    const after = applyEvent(
      run([stage("design", "running")]),
      event("stage.awaiting", { stageId: "design" }),
    );

    expect(stageOf(after, "design").status).toBe("awaiting");
    expect(after.status).toBe("awaiting");
  });

  test("stage.approved passes the gated stage and resumes the run", () => {
    const after = applyEvent(
      run([stage("design", "awaiting")], "awaiting"),
      event("stage.approved", { stageId: "design" }),
    );

    expect(stageOf(after, "design").status).toBe("passed");
    expect(after.status).toBe("running");
  });

  test("stage.skipped marks the stage skipped", () => {
    const after = applyEvent(
      run([stage("design", "pending")]),
      event("stage.skipped", { stageId: "design" }),
    );

    expect(stageOf(after, "design").status).toBe("skipped");
    expect(stageOf(after, "design").completedAt).toBe("2026-07-21T10:00:01.000Z");
  });

  test("run.message appends the message to the transcript", () => {
    const after = applyEvent(
      run([stage("design", "running")]),
      event("run.message", { chatMessage: message("m1", "use the dark palette", "2026-07-21T10:00:01.000Z") }),
    );

    expect(after.messages.map((entry) => entry.text)).toEqual(["use the dark palette"]);
  });

  test("a message already held is not appended twice by the replay", () => {
    const chatMessage = message("m1", "use the dark palette", "2026-07-21T10:00:01.000Z");
    const before = run([stage("design", "running")]);
    before.messages = [chatMessage];

    const after = applyEvent(before, event("run.message", { chatMessage }));

    expect(after.messages).toHaveLength(1);
  });

  test("run.message with no payload is ignored rather than appending a blank", () => {
    const before = run([stage("design", "running")]);

    const after = applyEvent(before, event("run.message"));

    expect(after.messages).toEqual([]);
  });

  test("an event naming a stage the run does not have changes nothing", () => {
    const before = run([stage("design", "running")]);

    const after = applyEvent(before, event("stage.failed", { stageId: "deploy" }));

    expect(after).toEqual(before);
  });

  test("the run passed in is never mutated", () => {
    const before = run([stage("design", "running")]);

    applyEvent(before, event("stage.completed", { stageId: "design" }));

    expect(before.stages[0]?.status).toBe("running");
    expect(before.stages[0]?.completedAt).toBeUndefined();
  });
});
