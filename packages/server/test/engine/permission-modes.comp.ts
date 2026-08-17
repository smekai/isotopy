// Component test: which permission flag does each real adapter hand its CLI?
// `permission-plan.spec.ts` proves the rule in isolation; this proves the wiring
// — the probe, the cache, the argv builders and the degradation notice — by
// running each adapter against a stub binary installed through the documented
// ISOTOPY_*_PATH override.
//
// The stub records every argv it is called with and answers `--help` from a
// fixture the test wrote, so a Codex build that advertises auto-review on `exec`
// but not on `exec resume` is something a test can actually arrange.
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import type { EngineId, EnginePermissionMode } from "@isotopy/core";
import { clearAutoReviewCache } from "../../src/engines/permission-mode.ts";
import {
  HELP_FILE,
  installEngineStubs,
  recordedArgv,
  removeEngineStubs,
  resetEngineStubs,
  runArgv,
  runStubAdapter,
  writeStubHelp,
} from "../support/engine-stub.ts";
import type { StageLogDraft } from "@isotopy/core";

const CLAUDE_HELP_WITH_AUTO = [
  "  --permission-mode <mode>              Permission mode to use for the session",
  '                                        (choices: "acceptEdits", "auto", "plan")',
].join("\n");

const CLAUDE_HELP_WITHOUT_AUTO = [
  "  --permission-mode <mode>              Permission mode to use for the session",
  '                                        (choices: "acceptEdits", "plan")',
].join("\n");

// One stub directory for the whole file: each adapter memoises the binary it
// resolved, so a fresh directory per test would leave them pointing at the old one.
beforeAll(() => {
  installEngineStubs();
});

beforeEach(() => {
  clearAutoReviewCache();
  resetEngineStubs();
});

afterAll(() => {
  removeEngineStubs();
});

describe("claude-code", () => {
  test("asks for the CLI's own auto mode when the CLI advertises one", async () => {
    // Arrange
    writeHelp(HELP_FILE, CLAUDE_HELP_WITH_AUTO);

    // Act
    await runAdapter("claude-code", "autoReview");

    // Assert
    expect(runArgv()).toContain("--permission-mode auto");
  });

  test("a build with no auto mode runs exactly as Never block does", async () => {
    // Arrange
    writeHelp(HELP_FILE, CLAUDE_HELP_WITHOUT_AUTO);

    // Act
    await runAdapter("claude-code", "autoReview");

    // Assert
    expect(runArgv()).toContain("--dangerously-skip-permissions");
    expect(runArgv()).not.toContain("--permission-mode");
  });

  test("a degraded run is never silent", async () => {
    // Arrange
    writeHelp(HELP_FILE, CLAUDE_HELP_WITHOUT_AUTO);

    // Act
    const logs = await runAdapter("claude-code", "autoReview");

    // Assert
    expect(logs.filter((log) => log.level === "info")).toHaveLength(1);
  });

  test("a run that never asked for auto-review never spends a probe on it", async () => {
    // Arrange
    writeHelp(HELP_FILE, CLAUDE_HELP_WITH_AUTO);

    // Act
    await runAdapter("claude-code", "skip");

    // Assert
    expect(recordedArgv()).toHaveLength(1);
  });
});

describe("codex", () => {
  test("routes escalations to Codex's own reviewer instead of denying them", async () => {
    // Act
    await runAdapter("codex", "autoReview");

    // Assert
    expect(runArgv()).toContain('approvals_reviewer="auto_review"');
    expect(runArgv()).toContain('approval_policy="on-request"');
  });

  test("auto-review keeps a real sandbox rather than trading safety for a reviewer", async () => {
    // Act
    await runAdapter("codex", "autoReview");

    // Assert
    expect(runArgv()).toContain("--sandbox workspace-write");
    expect(runArgv()).not.toContain("--dangerously-bypass-approvals-and-sandbox");
  });

  test("a resumed turn still gets a sandbox, which `exec resume` refuses as a flag", async () => {
    // Act
    await runAdapter("codex", "autoReview", "session-42");

    // Assert — `--sandbox` is rejected on resume, so the boundary goes via config.
    expect(runArgv()).toContain('sandbox_mode="workspace-write"');
    expect(runArgv()).not.toContain("--sandbox workspace-write");
  });

  test("a resumed accept-edits turn no longer drops to Codex's default sandbox", async () => {
    // Act
    await runAdapter("codex", "acceptEdits", "session-43");

    // Assert
    expect(runArgv()).toContain('sandbox_mode="workspace-write"');
  });
});

describe("cursor", () => {
  test("keeps running unrestricted, because its Auto-review is a config setting and not a flag", async () => {
    // Act
    const logs = await runAdapter("cursor", "autoReview");

    // Assert
    expect(runArgv()).toContain("--force");
    expect(logs.filter((log) => log.level === "info")).toHaveLength(1);
  });

  test("never reaches for the user's Cursor config to get there", async () => {
    // Act
    await runAdapter("cursor", "autoReview");

    // Assert — the standing rule is that CLI config files are read, never written.
    expect(process.env.CURSOR_CONFIG_DIR).toBeUndefined();
    expect(recordedArgv()).toHaveLength(1);
  });
});

function writeHelp(file: string, body: string): void {
  writeStubHelp(file, body);
}

async function runAdapter(
  engine: EngineId,
  permissionMode: EnginePermissionMode,
  resumeSessionId?: string,
): Promise<StageLogDraft[]> {
  return runStubAdapter(engine, { permissionMode, resumeSessionId });
}
