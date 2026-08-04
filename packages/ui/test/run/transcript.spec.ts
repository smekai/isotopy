// Unit spec: the thread is a *derived* view — the agents' narration already
// exists as stage logs, and only the user's turns are stored separately. Getting
// the merge wrong is how a reply ends up above the question that prompted it, so
// ordering across the two sources is what this covers.
import { describe, expect, test } from "vitest";
import type { RunState } from "@adhd/core";
import { buildTranscript, conversationOnly } from "../../src/transcript";
import { log, message, run, stage, started } from "../support/run-fixtures";

/** Narration the chat must drop and the log must keep. */
const MACHINERY = ["Developer online", "Read src/auth.ts", "Tool error"];




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

  test("a declared activity makes a tool row; level only splits prose from notice", () => {
    const state = run([
      started("implementation", "running", "2026-07-27T10:00:00.000Z", [
        log("2026-07-27T10:00:01.000Z", "info", "I will add the toggle"),
        toolLog("2026-07-27T10:00:02.000Z", "Read src/theme.ts"),
        toolErrorLog("2026-07-27T10:00:03.000Z", "Edit failed"),
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

  test("a run-level line with no activity is a notice, not hidden machinery", () => {
    const state = run([
      started("implementation", "running", "2026-07-27T10:00:00.000Z", [
        log("2026-07-27T10:00:01.000Z", "run", "Developer is resuming — the plan limit reset"),
      ]),
    ]);

    expect(buildTranscript(state).map((item) => item.kind)).toEqual([
      "stage",
      "notice",
    ]);
  });

  test("a tool row carries the tool's name rather than only its rendered line", () => {
    const state = run([
      started("implementation", "running", "2026-07-27T10:00:00.000Z", [
        log("2026-07-27T10:00:01.000Z", "run", "▶ Read src/theme.ts", {
          kind: "tool",
          name: "Read",
          detail: "src/theme.ts",
        }),
      ]),
    ]);

    const [, tool] = buildTranscript(state);

    expect(tool && "name" in tool ? tool.name : "").toBe("Read");
    expect(tool && "detail" in tool ? tool.detail : "").toBe("src/theme.ts");
  });

  test("a failed tool row is marked as failed", () => {
    const state = run([
      started("implementation", "running", "2026-07-27T10:00:00.000Z", [
        toolLog("2026-07-27T10:00:01.000Z", "Read src/theme.ts"),
        toolErrorLog("2026-07-27T10:00:02.000Z", "Edit failed"),
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

// Chat and Logs read one ordering; the chat is that ordering with the machinery
// removed. The split is structural — an adapter *declares* a line as tool, tool
// error or engine chatter, and all three become `tool` items — so nothing below
// matches on prose, and nothing infers machinery from a log level.
describe("conversationOnly", () => {
  const noisy = run([
    started("implementation", "passed", "2026-07-27T10:00:00.000Z", [
      log("2026-07-27T10:00:01.000Z", "run", "Developer online · Claude Code · haiku", {
        kind: "engine",
        name: "Claude Code",
      }),
      log("2026-07-27T10:00:02.000Z", "info", "Looking at the repository now."),
      toolLog("2026-07-27T10:00:03.000Z", "Read src/auth.ts"),
      toolErrorLog("2026-07-27T10:00:04.000Z", "Tool error: file not found"),
      log("2026-07-27T10:00:05.000Z", "pass", "✓ Developer finished"),
    ]),
  ]);

  test("the machinery is dropped and the conversation kept", () => {
    expect(buildTranscript(noisy).map((item) => item.kind)).toEqual([
      "stage",
      "tool",
      "agent",
      "tool",
      "tool",
      "notice",
    ]);
    expect(conversationOnly(buildTranscript(noisy)).map((item) => item.kind)).toEqual([
      "stage",
      "agent",
      "notice",
    ]);
  });

  test("engine chatter and tool rows leave the chat but stay in the log", () => {
    const chat = conversationOnly(buildTranscript(noisy))
      .map((item) => ("text" in item ? item.text : ""))
      .join("\n");
    const logs = buildTranscript(noisy)
      .map((item) => ("text" in item ? item.text : ""))
      .join("\n");

    expect(MACHINERY.filter((line) => chat.includes(line))).toEqual([]);
    expect(MACHINERY.filter((line) => logs.includes(line))).toEqual(MACHINERY);
  });

  test("who is working and how it ended are not machinery", () => {
    const items = conversationOnly(buildTranscript(noisy));

    expect(items[0]?.kind === "stage" && items[0].profession).toBe("Developer");
    expect(items[2]?.kind === "notice" && items[2].level).toBe("pass");
    expect(items[2]?.kind === "notice" && items[2].text).toContain("Developer finished");
  });

  test("questions and the user's own turns survive the filter", () => {
    const state = run([started("intake", "asking", "2026-07-27T10:00:00.000Z", [])]);
    state.messages = [
      message("q1", "SQLite or Postgres?", "2026-07-27T10:00:01.000Z", "agent"),
      message("a1", "SQLite", "2026-07-27T10:00:02.000Z"),
    ];

    expect(conversationOnly(buildTranscript(state)).map((item) => item.kind)).toEqual([
      "stage",
      "agent",
      "user",
    ]);
  });
});

function toolLog(ts: string, text: string, name = "Read") {
  return log(ts, "run", text, { kind: "tool", name });
}

function toolErrorLog(ts: string, text: string, name = "Edit") {
  return log(ts, "warn", text, { kind: "tool-error", name });
}

function threadOf(state: RunState) {
  return buildTranscript(state).map((item) => [item.kind, "text" in item ? item.text : item.kind]);
}
