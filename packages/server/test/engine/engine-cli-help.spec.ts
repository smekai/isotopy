import { expect, test } from "vitest";
import { claudePermissionModeChoices } from "../../src/schemas/engine-cli-help.ts";

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
