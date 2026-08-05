// Question mode: an interactive stage on a conversational engine may stop, ask,
// and continue in the *same* CLI session. Two things carry the weight — the run
// parks in `asking` (its own status, never the gate's `awaiting`), and the answer
// resumes rather than re-running, which is what `resumeSessionId` proves.
import { afterEach, beforeEach, expect, test } from "vitest";
import type { RunState } from "@adhd/core";
import {
  createTestApp,
  get,
  post,
  restartApp,
  startRun,
  stageOf,
  waitForRunStatus,
  waitForStageStatus,
} from "../support/harness.ts";
import type { TestApp } from "../support/harness.ts";

const TASK = "add a settings page";
const SESSION = "sess-abc123";
const QUESTION = "Which database should the settings live in?";
const USER_QUESTION = "Should the settings use SQLite or Postgres?";
const DONE = "Added the settings page.";

let ctx: TestApp;

beforeEach(async () => {
  ctx = await createTestApp();
});

afterEach(async () => {
  await ctx.dispose();
});

test("an interactive stage parks the run in asking, not awaiting", async () => {
  // Arrange
  const { app, engine } = ctx;
  engine.anticipate({ as: "opening turn" }).asks(QUESTION, SESSION);
  engine
    .anticipate({
      as: "Orchestrator escalation",
      persona: /# Role: Orchestrator/,
      prompt: /Which database should the settings live in/,
    })
    .reports(
      fenced({
        action: "escalate_to_user",
        question: USER_QUESTION,
        originStageId: "solo",
      }),
    );

  // Act
  const run = await startRun(app, { pipelineId: "solo", task: TASK, engine: "claude-code" });
  const parked = await waitForStageStatus(app, run.id, "solo", "asking");

  // Assert — `asking` is distinct from `awaiting`, so "Approve" never means two things
  expect(parked.status).toBe("asking");
  expect(stageOf(parked, "solo").status).toBe("asking");
  expect(parked.messages).toMatchObject([{
    role: "agent",
    kind: "question",
    text: QUESTION,
    stageId: "solo",
  }, {
    role: "agent",
    kind: "question",
    text: USER_QUESTION,
    stageId: "solo",
  }]);
  engine.verify();
});

test("answering resumes the same session rather than starting a new one", async () => {
  // Arrange
  const { app, engine } = ctx;
  engine.anticipate({ as: "opening turn", prompt: /add a settings page/ }).asks(QUESTION, SESSION);
  engine
    .anticipate({ as: "Orchestrator escalation", persona: /# Role: Orchestrator/ })
    .parks(
      fenced({
        action: "escalate_to_user",
        question: USER_QUESTION,
        originStageId: "solo",
      }),
      "broker-session",
    );
  engine
    .anticipate({
      as: "Orchestrator routing",
      resumeSessionId: "broker-session",
      prompt: /SQLite/,
    })
    .reports(
      fenced({
        action: "route_to_agent",
        stageId: "solo",
        message: "Use SQLite.",
        rationale: "The user selected it",
      }),
    );
  engine
    .anticipate({ as: "resumed turn", prompt: "Use SQLite.", resumeSessionId: SESSION })
    .reports(DONE);

  // Act
  const run = await startRun(app, { pipelineId: "solo", task: TASK, engine: "claude-code" });
  await waitForStageStatus(app, run.id, "solo", "asking");
  const { status } = await post(app, `/runs/${run.id}/messages`, { text: "SQLite" });
  const finished = await waitForRunStatus(app, run.id, "completed");

  // Assert
  expect(status).toBe(201);
  expect(stageOf(finished, "solo").status).toBe("passed");
  expect(finished.result).toBe(DONE);
  expect(
    ctx.orchestrations.list(ctx.registry.resolve().id)[0]?.brokerTurns?.map(
      (turn) => turn.decision.action,
    ),
  ).toEqual(["escalate_to_user", "route_to_agent"]);
  // The opening turn carried the task; the second carried only the answer.
  engine.verify();
});

test("an answer derived by the Orchestrator is recorded as an agent turn", async () => {
  // Arrange
  const { app, engine } = ctx;
  engine.anticipate({ as: "opening turn" }).asks(QUESTION, SESSION);
  engine
    .anticipate({ as: "Orchestrator answer", persona: /# Role: Orchestrator/ })
    .reports(
      fenced({
        action: "answer_agent",
        answer: "Use SQLite.",
        rationale: "The approved goal requires local storage",
      }),
    );
  engine
    .anticipate({ as: "resumed turn", prompt: "Use SQLite.", resumeSessionId: SESSION })
    .reports(DONE);

  // Act
  const run = await startRun(app, { pipelineId: "solo", task: TASK, engine: "claude-code" });
  const finished = await waitForRunStatus(app, run.id, "completed");

  // Assert
  expect(finished.messages.map((message) => [message.role, message.kind, message.text])).toEqual([
    ["agent", "question", QUESTION],
    ["agent", "answer", "Use SQLite."],
  ]);
  expect(
    ctx.orchestrations.list(ctx.registry.resolve().id)[0]?.brokerTurns,
  ).toMatchObject([
    {
      id: `${run.id}:solo:0:question`,
      runId: run.id,
      stageId: "solo",
      phase: "question",
      decision: { action: "answer_agent" },
    },
  ]);
  engine.verify();
});

test("an Orchestrator plan limit parks and retries the mediation turn", async () => {
  // Arrange
  const { app, engine } = ctx;
  engine.anticipate({ as: "opening turn" }).asks(QUESTION, SESSION);
  engine
    .anticipate({ as: "limited Orchestrator", persona: /# Role: Orchestrator/ })
    .hitsLimit("You've hit your session limit · resets 4:30pm (Europe/Tallinn)");
  engine
    .anticipate({ as: "retried Orchestrator", persona: /# Role: Orchestrator/ })
    .reports(
      fenced({
        action: "answer_agent",
        answer: "Use SQLite.",
        rationale: "The approved goal requires local storage",
      }),
    );
  engine
    .anticipate({ as: "resumed specialist", prompt: "Use SQLite.", resumeSessionId: SESSION })
    .reports(DONE);
  const run = await startRun(app, {
    pipelineId: "solo",
    task: TASK,
    engine: "claude-code",
  });
  await waitForStageStatus(app, run.id, "solo", "blocked");

  // Act
  const response = await post(
    app,
    `/runs/${run.id}/limit/solo/resolve`,
    { choice: "retry-now" },
  );
  const finished = await waitForRunStatus(app, run.id, "completed");

  // Assert
  expect(response.status).toBe(200);
  expect(finished.result).toBe(DONE);
  expect(finished.limit).toBeUndefined();
  engine.verify();
});

test("a mediation decision for another stage needs attention instead of bypassing the Orchestrator", async () => {
  // Arrange
  const { app, engine } = ctx;

  // Anticipate
  engine.anticipate({ as: "opening turn" }).asks(QUESTION, SESSION);
  engine
    .anticipate({ as: "wrong Orchestrator route", persona: /# Role: Orchestrator/ })
    .reports(
      fenced({
        action: "escalate_to_user",
        question: USER_QUESTION,
        originStageId: "implementation",
      }),
    );

  // Act
  const run = await startRun(app, {
    pipelineId: "solo",
    task: TASK,
    engine: "claude-code",
  });

  // Assert
  const finished = await waitForRunStatus(app, run.id, "needs_attention");
  expect(stageOf(finished, "solo").status).toBe("failed");
  expect(stageOf(finished, "solo").logs.at(-1)?.message).toContain(
    'instead of "solo"',
  );
  expect(finished.status).toBe("needs_attention");
  engine.verify();
});

test("a non-interactive stage never parks, even if it prints a QUESTION line", async () => {
  // Arrange — only the Project Manager is interactive; the Developer printing
  // the marker must not stall the run.
  const { app, engine } = ctx;
  engine.anticipate({ as: "Project Manager" }).reports("Build it with SQLite.");
  engine.anticipate({ as: "Developer" }).asks(QUESTION, SESSION);
  engine.anticipate({ as: "Tester" }).reports("Checked it.\n\nVERDICT: PASS");

  // Act
  const run = await startRun(app, { pipelineId: "pm-dev-test", task: TASK, engine: "claude-code" });
  await waitForStageStatus(app, run.id, "intake", "awaiting");
  await post(app, `/runs/${run.id}/gates/intake/approve`);
  const finished = await waitForRunStatus(app, run.id, "completed");

  // Assert
  expect(stageOf(finished, "implementation").status).toBe("passed");
  expect(finished.messages).toEqual([]);
  engine.verify();
});

test("a parked question survives a server restart", async () => {
  // Arrange
  const { app, engine } = ctx;
  engine.anticipate({ as: "opening turn" }).asks(QUESTION, SESSION);
  engine
    .anticipate({ as: "Orchestrator escalation", persona: /# Role: Orchestrator/ })
    .reports(
      fenced({
        action: "escalate_to_user",
        question: USER_QUESTION,
        originStageId: "solo",
      }),
    );
  const run = await startRun(app, { pipelineId: "solo", task: TASK, engine: "claude-code" });
  await waitForStageStatus(app, run.id, "solo", "asking");
  await ctx.orchestrator.shutdown();

  // Act
  const restarted = await restartApp();
  const { body } = await get<RunState>(restarted.app, `/runs/${run.id}`);

  // Assert — a durable park, not a setTimeout: the question is still open.
  expect(body.status).toBe("asking");
  expect(stageOf(body, "solo").status).toBe("asking");
  expect(body.messages.at(-1)?.text).toBe(USER_QUESTION);
  await restarted.shutdown();
});

test("aborting a parked run skips the asking stage rather than stranding it", async () => {
  // Arrange
  const { app, engine } = ctx;
  engine.anticipate({ as: "opening turn" }).asks(QUESTION, SESSION);
  engine
    .anticipate({ as: "Orchestrator escalation", persona: /# Role: Orchestrator/ })
    .reports(
      fenced({
        action: "escalate_to_user",
        question: USER_QUESTION,
        originStageId: "solo",
      }),
    );
  const run = await startRun(app, { pipelineId: "solo", task: TASK, engine: "claude-code" });
  await waitForStageStatus(app, run.id, "solo", "asking");

  // Act
  await post(app, `/runs/${run.id}/abort`);
  const aborted = await waitForRunStatus(app, run.id, "cancelled");

  // Assert
  expect(stageOf(aborted, "solo").status).toBe("skipped");
});

function fenced(decision: unknown): string {
  return `\`\`\`adhd-orchestrator-decision\n${JSON.stringify(decision)}\n\`\`\``;
}
