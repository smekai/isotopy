// A coding CLI that leaves a dev server behind is not hypothetical: driving a
// real Cursor run for TASK-117, the Developer ran `pnpm dev` to smoke-check its
// own work, and the stage never finished. The CLI had exited; its grandchild
// still held the stdout pipe, so `close` never fired and `runSubprocess` waited
// on a promise nothing would resolve — past the engine timeout, indefinitely.
//
// The stand-in below is that shape with no CLI involved: a node process that
// spawns a detached child holding the inherited pipe, then exits.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";
import { runSubprocess } from "../../src/engines/subprocess.ts";

// Long enough to still be holding the pipe when the assertions run, short
// enough that it is gone before the suite ends.
const LINGER_MS = 20_000;

/** Prints, spawns a child that inherits stdio and outlives it, then exits 0. */
const LEAVES_A_CHILD_BEHIND = `
const { spawn } = require("node:child_process");
console.log("done");
spawn(process.execPath, ["-e", "setTimeout(() => {}, ${LINGER_MS})"], {
  stdio: "inherit",
  detached: true,
}).unref();
process.exit(0);
`;

const CHATTER_WINDOW_MS = 1500;

/** Prints, then leaves behind a child that keeps printing down the inherited pipe. */
const KEEPS_TALKING = `
const { spawn } = require("node:child_process");
console.log("first");
spawn(process.execPath, ["-e", "setInterval(() => console.log('still here'), 100); setTimeout(() => {}, ${LINGER_MS})"], {
  stdio: "inherit",
  detached: true,
}).unref();
process.exit(0);
`;

let dir: string;
let script: string;
let chatty: string;

beforeAll(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "isotopy-subprocess-"));
  script = path.join(dir, "leaves-a-child-behind.cjs");
  writeFileSync(script, LEAVES_A_CHILD_BEHIND);
  chatty = path.join(dir, "keeps-talking.cjs");
  writeFileSync(chatty, KEEPS_TALKING);
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
});

test("output from a survivor stops at the settle, so a failed stage cannot grow new logs", async () => {
  // Arrange — the same leak as above, but the grandchild keeps talking. Nothing
  // it says afterwards belongs to a stage that has already reported.
  const lines: string[] = [];

  // Act
  await runSubprocess({
    command: process.execPath,
    args: [chatty],
    cwd: os.tmpdir(),
    timeoutMs: 15_000,
    onLine: (_stream, line) => lines.push(line),
  });
  const atSettle = lines.length;
  await new Promise((resolve) => setTimeout(resolve, CHATTER_WINDOW_MS));

  // Assert — the survivor is still printing; none of it reached us.
  expect(atSettle).toBeGreaterThan(0);
  expect(lines).toHaveLength(atSettle);
}, 20_000);

test("a process that exits is settled even while something else holds its pipe", async () => {
  // Act — a timeout far below the lingering child's lifetime, so a hang here
  // cannot be mistaken for a slow pass.
  // The lingering grandchild inherits this cwd, and on Windows a live process
  // in `dir` would block afterAll's delete.
  const result = await runSubprocess({
    command: process.execPath,
    args: [script],
    cwd: os.tmpdir(),
    timeoutMs: 15_000,
  });

  // Assert
  expect(result.timedOut).toBe(false);
  expect(result.exitCode).toBe(0);
  expect(result.success).toBe(true);
  expect(result.stdout).toContain("done");
}, 20_000);
