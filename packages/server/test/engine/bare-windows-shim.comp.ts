// TASK-157's dogfood: Setup writes `npm.cmd` as the Windows start command, and
// the product exited at once with MODULE_NOT_FOUND. A batch file run through
// `cmd /c` by a quoted bare name resolves its own `%~dp0` against the working
// directory, so npm looked for itself inside the project. POSIX never takes the
// shell path, so these only run on Windows.
import { mkdtemp } from "node:fs/promises";
import path from "node:path";
import { expect, inject, test } from "vitest";
import { runSubprocess } from "../../src/engines/subprocess.ts";

const ON_WINDOWS = process.platform === "win32";
const MISSING_SHIM = "isotopy-no-such-tool.cmd";

test.runIf(ON_WINDOWS)("a bare .cmd name runs from a project that does not contain it", async () => {
  // Arrange
  const project = await mkdtemp(path.join(inject("testTempRoot"), "bare-cmd-"));

  // Act
  const result = await runSubprocess({
    command: "npm.cmd",
    args: ["--version"],
    cwd: project,
    timeoutMs: 30_000,
  });

  // Assert
  expect(result.success, result.errorMessage ?? result.stderrTail.join("\n")).toBe(true);
  expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
});

test.runIf(ON_WINDOWS)("a bare .cmd name that is not on PATH fails naming it, before anything starts", async () => {
  // Arrange
  const project = await mkdtemp(path.join(inject("testTempRoot"), "missing-cmd-"));

  // Act
  const result = await runSubprocess({ command: MISSING_SHIM, cwd: project, timeoutMs: 10_000 });

  // Assert
  expect(result.success).toBe(false);
  expect(result.exitCode).toBeNull();
  expect(result.errorMessage).toContain(MISSING_SHIM);
});
