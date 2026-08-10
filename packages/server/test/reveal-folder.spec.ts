import { expect, test } from "vitest";
import { revealCommand, revealFolder } from "../src/utils/reveal-folder.ts";
import type { SubprocessResult } from "../src/engines/subprocess.ts";

const TARGET = "C:\\projects\\app";

function outcome(overrides: Partial<SubprocessResult> = {}): SubprocessResult {
  return {
    success: false,
    exitCode: 1,
    termSignal: null,
    timedOut: false,
    aborted: false,
    stdout: "",
    stderrTail: [],
    durationMs: 12,
    ...overrides,
  };
}

function ran(result: SubprocessResult) {
  return () => Promise.resolve(result);
}

test("Windows opens the folder through Explorer", () => {
  expect(revealCommand("win32", TARGET)).toEqual({
    executable: "explorer.exe",
    args: [TARGET],
  });
});

test("macOS opens the folder through open", () => {
  expect(revealCommand("darwin", "/Users/dev/app")).toEqual({
    executable: "open",
    args: ["/Users/dev/app"],
  });
});

test("every other platform falls back to the freedesktop opener", () => {
  expect(revealCommand("linux", "/home/dev/app")).toEqual({
    executable: "xdg-open",
    args: ["/home/dev/app"],
  });
});

test("the path is one argument, never spliced into a shell string", () => {
  expect(revealCommand("darwin", "/Users/dev/my app").args).toEqual(["/Users/dev/my app"]);
});

test("Explorer exiting non-zero is not a failure, because it does that when it succeeds", async () => {
  const explorer = ran(outcome({ exitCode: 1 }));

  await expect(
    revealFolder(TARGET, { platform: "win32", run: explorer }),
  ).resolves.toBeUndefined();
});

test("an opener that never started is a failure on Windows too", async () => {
  const missing = ran(outcome({ exitCode: null, errorMessage: "spawn ENOENT" }));

  await expect(revealFolder(TARGET, { platform: "win32", run: missing })).rejects.toThrow(
    /spawn ENOENT/,
  );
});

test("an opener that hung past its timeout is a failure on Windows too", async () => {
  const hung = ran(outcome({ exitCode: null, timedOut: true, errorMessage: "Timed out after 10s" }));

  await expect(revealFolder(TARGET, { platform: "win32", run: hung })).rejects.toThrow(
    /Timed out/,
  );
});

test("a non-zero exit is still a failure where the opener reports honestly", async () => {
  const refused = ran(outcome({ exitCode: 1, errorMessage: "Process exited with code 1" }));

  await expect(
    revealFolder("/Users/dev/app", { platform: "darwin", run: refused }),
  ).rejects.toThrow(/exited with code 1/);
});
