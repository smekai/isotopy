// A role's memory of the project, proved end to end through a real run.
//
// The unit tests cover merging and rendering. What only a run can show is that
// the invitation reaches the prompt, that what a role writes back lands under
// that role's own file, and that the next run replays it to that role and to
// nobody else.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import {
  approveIntake,
  createTestApp,
  startRun,
  waitForRunStatus,
} from "../support/harness.ts";
import type { TestApp } from "../support/harness.ts";

test("every persona's prompt invites the notes it alone will get back", async () => {
  // Arrange
  const { app, engine } = ctx;

  // Anticipate
  engine.anticipate({ as: "Product Manager" }).reports(PM_REPORT);
  engine.anticipate({ as: "Developer" }).reports(DEV_REPORT);
  engine.anticipate({ as: "QA Engineer" }).reports(TESTER_REPORT);
  engine.anticipateRunReview();

  // Act
  const run = await startRun(app, PIPELINE);
  await approveIntake(app, run.id);

  // Assert
  await waitForRunStatus(app, run.id, "completed");
  expect(engine.callAt(1).prompt).toContain("## Notes for your next run here");
  expect(engine.callAt(1).prompt).toContain("```isotopy-persona-notes");
});

test("a note the Developer wrote is stored under the Developer's own file", async () => {
  // Arrange
  const { app, engine, home } = ctx;

  // Anticipate — only the Developer ends its report with a notes block.
  engine.anticipate({ as: "Product Manager" }).reports(PM_REPORT);
  engine.anticipate({ as: "Developer" }).reports(DEV_REPORT_WITH_NOTES);
  engine.anticipate({ as: "QA Engineer" }).reports(TESTER_REPORT);
  engine.anticipateRunReview();

  // Act
  const run = await startRun(app, PIPELINE);
  await approveIntake(app, run.id);

  // Assert
  await waitForRunStatus(app, run.id, "completed");
  expect(await readNotes(home, "developer")).toContain(LEARNED_FACT);
  expect(await readNotes(home, "tester")).toBeUndefined();
});

test("the next run replays the note to that role and to nobody else", async () => {
  // Arrange — a note the Developer left behind on an earlier run.
  const { app, engine, home } = ctx;
  await writeNotes(home, "developer", LEARNED_FACT);

  // Anticipate
  engine.anticipate({ as: "Product Manager" }).reports(PM_REPORT);
  engine.anticipate({ as: "Developer" }).reports(DEV_REPORT);
  engine.anticipate({ as: "QA Engineer" }).reports(TESTER_REPORT);
  engine.anticipateRunReview();

  // Act
  const run = await startRun(app, PIPELINE);
  await approveIntake(app, run.id);

  // Assert
  await waitForRunStatus(app, run.id, "completed");
  expect(engine.callAt(1).appendSystemPrompt).toContain(LEARNED_FACT);
  expect(engine.callAt(2).appendSystemPrompt).not.toContain(LEARNED_FACT);
});

test("a new note joins the stored ones without repeating what is already there", async () => {
  // Arrange — one fact already known, and the Developer is about to send it back
  // alongside a second one.
  const { app, engine, home } = ctx;
  await writeNotes(home, "developer", LEARNED_FACT);

  // Anticipate
  engine.anticipate({ as: "Product Manager" }).reports(PM_REPORT);
  engine.anticipate({ as: "Developer" }).reports(DEV_REPORT_WITH_TWO_NOTES);
  engine.anticipate({ as: "QA Engineer" }).reports(TESTER_REPORT);
  engine.anticipateRunReview();

  // Act
  const run = await startRun(app, PIPELINE);
  await approveIntake(app, run.id);

  // Assert
  await waitForRunStatus(app, run.id, "completed");
  const stored = (await readNotes(home, "developer")) ?? "";
  expect(stored.split(LEARNED_FACT)).toHaveLength(2);
  expect(stored).toContain(SECOND_FACT);
});

test("a malformed notes block leaves the stage and the stored notes alone", async () => {
  // Arrange
  const { app, engine, home } = ctx;

  // Anticipate — the block is present but is not the shape the schema names.
  engine.anticipate({ as: "Product Manager" }).reports(PM_REPORT);
  engine.anticipate({ as: "Developer" }).reports(DEV_REPORT_WITH_BAD_NOTES);
  engine.anticipate({ as: "QA Engineer" }).reports(TESTER_REPORT);
  engine.anticipateRunReview();

  // Act
  const run = await startRun(app, PIPELINE);
  await approveIntake(app, run.id);

  // Assert — a role.s memory is optional, so the stage still passes and the block
  // is still stripped: it was addressed to the system either way.
  const finished = await waitForRunStatus(app, run.id, "completed");
  expect(finished.stageOutputs?.implementation).toBe(DEV_REPORT);
  expect(await readNotes(home, "developer")).toBeUndefined();
});


// The notes block is addressed to the system, not to the next box. It is stripped
// before the report is stored, or `upstreamFor` would replay a role's private
// notes to every stage after it — making them private only on the *next* run.
test("a role's notes never reach the next box in the same run", async () => {
  // Arrange
  const { app, engine } = ctx;

  // Anticipate
  engine.anticipate({ as: "Product Manager" }).reports(PM_REPORT);
  engine.anticipate({ as: "Developer" }).reports(DEV_REPORT_WITH_NOTES);
  engine.anticipate({ as: "QA Engineer" }).reports(TESTER_REPORT);
  engine.anticipateRunReview();

  // Act
  const run = await startRun(app, PIPELINE);
  await approveIntake(app, run.id);

  // Assert
  await waitForRunStatus(app, run.id, "completed");
  expect(engine.callAt(2).prompt).not.toContain(LEARNED_FACT);
});

test("the stored report keeps the work and drops the notes block", async () => {
  // Arrange
  const { app, engine } = ctx;

  // Anticipate
  engine.anticipate({ as: "Product Manager" }).reports(PM_REPORT);
  engine.anticipate({ as: "Developer" }).reports(DEV_REPORT_WITH_NOTES);
  engine.anticipate({ as: "QA Engineer" }).reports(TESTER_REPORT);
  engine.anticipateRunReview();

  // Act
  const run = await startRun(app, PIPELINE);
  await approveIntake(app, run.id);

  // Assert
  const finished = await waitForRunStatus(app, run.id, "completed");
  expect(finished.stageOutputs?.implementation).toBe(DEV_REPORT);
});
const LEARNED_FACT = "The staging database is seeded from fixtures/seed.sql";
const SECOND_FACT = "The build script is bin/build, not package.json scripts";

const PM_REPORT = "Add a greet function. Done when it prints a greeting.";
const DEV_REPORT = "Added greet.js and a smoke check.";
const TESTER_REPORT = "Ran the suite, all green.\n\nVERDICT: PASS";

const DEV_REPORT_WITH_NOTES = [
  DEV_REPORT,
  "",
  "```isotopy-persona-notes",
  JSON.stringify({ notes: [LEARNED_FACT] }),
  "```",
].join("\n");

const DEV_REPORT_WITH_TWO_NOTES = [
  DEV_REPORT,
  "",
  "```isotopy-persona-notes",
  JSON.stringify({ notes: [LEARNED_FACT, SECOND_FACT] }),
  "```",
].join("\n");

const DEV_REPORT_WITH_BAD_NOTES = [
  DEV_REPORT,
  "",
  "```isotopy-persona-notes",
  JSON.stringify({ lessons: [LEARNED_FACT] }),
  "```",
].join("\n");

const PIPELINE = {
  pipelineId: "pm-dev-test",
  task: "add a greet function",
  engine: "claude-code",
};

let ctx: TestApp;

beforeEach(async () => {
  ctx = await createTestApp();
});

afterEach(async () => {
  await ctx.dispose();
});

function notesPath(home: string, skillId: string): string {
  return path.join(home, "skills", `${skillId}.notes.md`);
}

function readNotes(home: string, skillId: string): Promise<string | undefined> {
  return readFile(notesPath(home, skillId), "utf8").catch(() => undefined);
}

async function writeNotes(
  home: string,
  skillId: string,
  note: string,
): Promise<void> {
  await mkdir(path.join(home, "skills"), { recursive: true });
  await writeFile(notesPath(home, skillId), `- ${note}\n`, "utf8");
}
