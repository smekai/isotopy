// Unit spec: the thread is a *derived* view — the agents' narration already
// exists as stage logs, and only the user's turns are stored separately. Getting
// the merge wrong is how a reply ends up above the question that prompted it, so
// ordering across the two sources is what this covers.
import { describe, expect, test } from "vitest";
import type { LogLevel, RunState, StageState, StageStatus } from "@adhd/core";
import { buildTranscript } from "../src/transcript";
import { message, run, stage } from "./support/run-fixtures";

function log(ts: string, level: LogLevel, text: string) {
  return { ts, level, message: text };
}

function started(id: string, status: StageStatus, at: string, logs: StageState["logs"]) {
  return { ...stage(id, status), startedAt: at, logs };
}

function threadOf(state: RunState) {
  return buildTranscript(state).map((item) => [item.kind, "text" in item ? item.text : item.kind]);
}

describe("buildTranscript", () => {
  test("a stage that has started opens with its own divider", () => {
    const state = run([started("implementation", "running", "2026-07-27T10:00:00.000Z", [])]);

    const [first] = buildTranscript(state);

    expect(first?.kind).toBe("stage");
    expect(first && "profession" in first ? first.profession : "").toBe("Developer");
  });

  test("a stage that has not started contributes nothing", () => {
    const state = run([stage("test", "pending")]);

    expect(buildTranscript(state)).toEqual([]);
  });

  test("log levels split into agent prose, tool rows and notices", () => {
    const state = run([
      started("implementation", "running", "2026-07-27T10:00:00.000Z", [
        log("2026-07-27T10:00:01.000Z", "info", "I will add the toggle"),
        log("2026-07-27T10:00:02.000Z", "run", "Read src/theme.ts"),
        log("2026-07-27T10:00:03.000Z", "warn", "Edit failed"),
        log("2026-07-27T10:00:04.000Z", "pass", "✓ Developer finished"),
      ]),
    ]);

    expect(buildTranscript(state).map((item) => item.kind)).toEqual([
      "stage",
      "agent",
      "tool",
      "tool",
      "notice",
    ]);
  });

  test("a failed tool row is marked as failed", () => {
    const state = run([
      started("implementation", "running", "2026-07-27T10:00:00.000Z", [
        log("2026-07-27T10:00:01.000Z", "run", "Read src/theme.ts"),
        log("2026-07-27T10:00:02.000Z", "warn", "Edit failed"),
      ]),
    ]);

    const tools = buildTranscript(state).filter((item) => item.kind === "tool");
    expect(tools.map((item) => item.kind === "tool" && item.failed)).toEqual([false, true]);
  });

  test("a user message lands between the log lines it was typed between", () => {
    const state = run([
      started("implementation", "running", "2026-07-27T10:00:00.000Z", [
        log("2026-07-27T10:00:01.000Z", "info", "before"),
        log("2026-07-27T10:00:05.000Z", "info", "after"),
      ]),
    ]);
    state.messages = [message("m1", "use the dark palette", "2026-07-27T10:00:03.000Z")];

    expect(threadOf(state)).toEqual([
      ["stage", "stage"],
      ["agent", "before"],
      ["user", "use the dark palette"],
      ["agent", "after"],
    ]);
  });

  test("two stages stay in order, each behind its own divider", () => {
    const state = run([
      started("implementation", "passed", "2026-07-27T10:00:00.000Z", [
        log("2026-07-27T10:00:01.000Z", "info", "dev speaking"),
      ]),
      started("test", "running", "2026-07-27T10:01:00.000Z", [
        log("2026-07-27T10:01:01.000Z", "info", "tester speaking"),
      ]),
    ]);

    expect(threadOf(state)).toEqual([
      ["stage", "stage"],
      ["agent", "dev speaking"],
      ["stage", "stage"],
      ["agent", "tester speaking"],
    ]);
  });

  test("items sharing a timestamp keep collection order rather than shuffling", () => {
    const sameTs = "2026-07-27T10:00:00.000Z";
    const state = run([
      started("implementation", "running", sameTs, [
        log(sameTs, "info", "first"),
        log(sameTs, "info", "second"),
        log(sameTs, "info", "third"),
      ]),
    ]);

    expect(threadOf(state)).toEqual([
      ["stage", "stage"],
      ["agent", "first"],
      ["agent", "second"],
      ["agent", "third"],
    ]);
  });

  test("every item carries a stable unique key", () => {
    const state = run([
      started("implementation", "running", "2026-07-27T10:00:00.000Z", [
        log("2026-07-27T10:00:01.000Z", "info", "repeated"),
        log("2026-07-27T10:00:01.000Z", "info", "repeated"),
      ]),
    ]);
    state.messages = [message("m1", "hello", "2026-07-27T10:00:02.000Z")];

    const keys = buildTranscript(state).map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("an agent message is prose, not a user bubble", () => {
    const state = run([]);
    state.messages = [message("q1", "Which database?", "2026-07-27T10:00:00.000Z", "agent")];

    expect(threadOf(state)).toEqual([["agent", "Which database?"]]);
  });
});
