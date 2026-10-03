import path from "node:path";
import { ESLint } from "eslint";
import { expect, test } from "vitest";
import { REPO_ROOT } from "../../src/paths.ts";

const SERVICE_FILE = path.join(REPO_ROOT, "packages", "server", "src", "services", "reporting.ts");
const CONSOLE_LOGGER = path.join(REPO_ROOT, "packages", "server", "src", "utils", "console-logger.ts");

test("source that writes to the console fails lint, so a failure goes through the Logger seam", async () => {
  // Arrange
  const eslint = new ESLint({ cwd: REPO_ROOT });

  // Act
  const [result] = await eslint.lintText(
    'export function report(error: unknown): void {\n  console.warn("failed", error);\n}\n',
    { filePath: SERVICE_FILE },
  );

  // Assert
  expect(ruleIdsOf(result)).toContain("no-console");
});

test("an empty catch fails lint in source, so a swallowed error has to read as a fallback", async () => {
  // Arrange
  const eslint = new ESLint({ cwd: REPO_ROOT });

  // Act
  const [result] = await eslint.lintText(
    "export function read(load: () => string): string {\n  try {\n    return load();\n  } catch {}\n  return \"\";\n}\n",
    { filePath: SERVICE_FILE },
  );

  // Assert
  expect(ruleIdsOf(result)).toContain("no-empty");
});

test("the console logger is the one source file allowed to write to the console", async () => {
  // Arrange
  const eslint = new ESLint({ cwd: REPO_ROOT });

  // Act
  const [result] = await eslint.lintFiles([CONSOLE_LOGGER]);

  // Assert
  expect(ruleIdsOf(result)).toEqual([]);
});

function ruleIdsOf(result: ESLint.LintResult | undefined): (string | null)[] {
  return result?.messages.map((message) => message.ruleId) ?? [];
}
