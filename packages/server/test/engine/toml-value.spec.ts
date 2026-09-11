// A Codex `-c key=value` value is parsed as TOML, where a Windows path inside a
// basic string is a run of invalid escape sequences. Which quoting a value gets
// is therefore a correctness question, not a formatting one.
import { expect, test } from "vitest";
import {
  tomlString,
  tomlStringArray,
  tomlStringTable,
} from "../../src/domain/rules/toml-value.ts";

const WINDOWS_PATH = String.raw`C:\Users\dev\node_modules\pkg\dist\mcp-server.js`;

const POSIX_PATH = "/Users/dev/node_modules/pkg/dist/mcp-server.js";

test("a Windows path is a literal string, where a basic string would be invalid escapes", () => {
  expect(tomlString(WINDOWS_PATH)).toBe(`'${WINDOWS_PATH}'`);
});

test("a POSIX path is a literal string too, so one rendering serves both platforms", () => {
  expect(tomlString(POSIX_PATH)).toBe(`'${POSIX_PATH}'`);
});

// A literal string has no escape mechanism at all, so a value containing one is
// the single case that has to fall back.
test("a value carrying an apostrophe falls back to an escaped basic string", () => {
  expect(tomlString("/Users/o'brien/dist")).toBe('"/Users/o\'brien/dist"');
});

test("every backslash survives the fallback, because a basic string would otherwise eat them", () => {
  expect(tomlString(String.raw`C:\o'brien\dist`)).toBe(String.raw`"C:\\o'brien\\dist"`);
});

test("an array renders every entry with the same quoting rule", () => {
  expect(tomlStringArray([WINDOWS_PATH])).toBe(`['${WINDOWS_PATH}']`);
});

test("an inline table renders keys bare and values quoted", () => {
  expect(tomlStringTable({ TASKPLANNER_WORKSPACE_ROOT: POSIX_PATH })).toBe(
    `{ TASKPLANNER_WORKSPACE_ROOT = '${POSIX_PATH}' }`,
  );
});
