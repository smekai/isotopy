import { describe, expect, test } from "vitest";
import {
  claudePermissionModeChoices,
  helpAdvertisesFlag,
} from "../../src/schemas/engine-cli-help.ts";

// The real shape printed by Claude Code 2.1.215: the choice list wraps across
// four lines, so anything reading a line at a time sees none of the modes.
const CLAUDE_HELP = [
  "  --permission-mode <mode>              Permission mode to use for the session",
  '                                        (choices: "acceptEdits", "auto",',
  '                                        "bypassPermissions", "manual",',
  '                                        "dontAsk", "plan")',
  "  --plugin-dir <path>                   Load a plugin from a directory or .zip",
].join("\n");

const CLAUDE_HELP_WITHOUT_AUTO = [
  "  --permission-mode <mode>              Permission mode to use for the session",
  '                                        (choices: "acceptEdits", "plan")',
  "  --plugin-dir <path>                   Load a plugin from a directory or .zip",
].join("\n");

const CLAUDE_HELP_WITHOUT_CHOICES = [
  "  --permission-mode <mode>              Permission mode to use for the session",
  "  --input-format <format>               Input format (only works with --print):",
  '                                        (choices: "text", "auto")',
].join("\n");

const CODEX_EXEC_HELP = [
  "  -s, --sandbox <SANDBOX_MODE>",
  "          Select the sandbox policy to use",
  "",
  "      --dangerously-bypass-approvals-and-sandbox",
  "          Skip all confirmation prompts",
].join("\n");

const CODEX_EXEC_HELP_WITH_AUTO_REVIEW = [
  "      --approve-for-me",
  "          Let a reviewer agent approve boundary-crossing actions",
].join("\n");

describe("claudePermissionModeChoices", () => {
  test("reads a choice list that wraps across four help lines", () => {
    expect(claudePermissionModeChoices(CLAUDE_HELP)).toEqual([
      "acceptEdits",
      "auto",
      "bypassPermissions",
      "manual",
      "dontAsk",
      "plan",
    ]);
  });

  test("survives the CRLF a Windows .cmd shim prints", () => {
    expect(claudePermissionModeChoices(CLAUDE_HELP.replace(/\n/g, "\r\n"))).toContain("auto");
  });

  test("a build whose permission modes exclude auto does not advertise auto-review", () => {
    expect(claudePermissionModeChoices(CLAUDE_HELP_WITHOUT_AUTO)).not.toContain("auto");
  });

  test("a later option's choices are not mistaken for the permission modes", () => {
    expect(claudePermissionModeChoices(CLAUDE_HELP_WITHOUT_CHOICES)).toEqual([]);
  });

  test("a build with no permission-mode flag at all offers no choices", () => {
    expect(claudePermissionModeChoices(CODEX_EXEC_HELP)).toEqual([]);
  });
});

describe("helpAdvertisesFlag", () => {
  test("the installed Codex exec help offers no auto-review flag", () => {
    expect(helpAdvertisesFlag(CODEX_EXEC_HELP, "--approve-for-me")).toBe(false);
  });

  test("a newer Codex exec help does offer it", () => {
    expect(helpAdvertisesFlag(CODEX_EXEC_HELP_WITH_AUTO_REVIEW, "--approve-for-me")).toBe(true);
  });

  test("a longer flag that merely starts with the same letters is not a match", () => {
    expect(helpAdvertisesFlag("      --approve-for-meta", "--approve-for-me")).toBe(false);
  });

  test("a flag mentioned mid-sentence rather than as its own word is not a match", () => {
    expect(helpAdvertisesFlag("see also x--approve-for-me", "--approve-for-me")).toBe(false);
  });
});
