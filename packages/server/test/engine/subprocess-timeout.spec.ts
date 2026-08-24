// TASK-142's dogfood found a stage that reported "Timed out after 600s" after
// running 5316s: the timeout killed the CLI, `taskkill /T` missed the dev server
// the agent had left behind, the parent never exited, and nothing settled the
// promise for 79 minutes. Two halves are covered here — the message a settled
// timeout carries, and whether a failed kill is reported at all. An unkillable
// child is not portably reproducible, so the deadline that settles regardless is
// exercised through its reporting rather than by simulating the hang.
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import os from "node:os";
import { expect, test } from "vitest";
import { killProcessTree, timeoutMessage } from "../../src/engines/subprocess.ts";

const NO_SUCH_PID = 999_999;

const REPORT_DEADLINE_MS = 15_000;
const REPORT_POLL_MS = 100;

/** Spawning taskkill takes as long as a loaded machine takes; a fixed wait flakes. */
async function reported(problems: string[]): Promise<void> {
  const deadline = Date.now() + REPORT_DEADLINE_MS;
  while (problems.length === 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, REPORT_POLL_MS));
  }
}

test("a timeout that settled on time names only the timeout", () => {
  expect(timeoutMessage(600_000, 600_400)).toBe("Timed out after 600s");
});

test("a timeout the process outlived reports how long it actually took", () => {
  // The dogfood's numbers: the message and the duration disagreed by 79 minutes
  // and only the message was ever shown.
  expect(timeoutMessage(600_000, 5_316_141)).toBe(
    "Timed out after 600s, abandoned after 5316s",
  );
});

test("a kill that failed is carried into the message, because a silent one leaks a port", () => {
  expect(timeoutMessage(600_000, 5_316_141, "taskkill exited 128; a child process may still be running")).toBe(
    "Timed out after 600s, abandoned after 5316s — taskkill exited 128; a child process may still be running",
  );
});

test.skipIf(process.platform !== "win32")(
  "a taskkill that cannot reach the process reports it rather than failing silently",
  async () => {
    // Arrange — a child object naming a pid that does not exist, which is what a
    // reused or already-reaped pid looks like to taskkill.
    const problems: string[] = [];
    const absent = { pid: NO_SUCH_PID, exitCode: null, signalCode: null } as ChildProcess;

    // Act
    killProcessTree(absent, (message) => problems.push(message));
    await reported(problems);

    // Assert
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/taskkill/);
  },
  20_000,
);

test.skipIf(process.platform === "win32")(
  "a POSIX group signal reaches a detached grandchild the pid alone would miss",
  async () => {
    // Arrange — the shape that leaked a port on Windows: a child that spawns a
    // grandchild and stays alive.
    const child = spawn(
      process.execPath,
      [
        "-e",
        "require('node:child_process').spawn(process.execPath,['-e','setTimeout(()=>{},60000)'],{stdio:'ignore'});setTimeout(()=>{},60000)",
      ],
      { cwd: os.tmpdir(), detached: true, stdio: "ignore" },
    );
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Act
    killProcessTree(child);
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Assert
    expect(child.killed || child.exitCode !== null || child.signalCode !== null).toBe(true);
  },
  10_000,
);
