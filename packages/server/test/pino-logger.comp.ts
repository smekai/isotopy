import { mkdtemp, readFile } from "node:fs/promises";
import path from "node:path";
import { expect, inject, test } from "vitest";
import { PinoLogger } from "../src/utils/pino-logger.ts";

test("a reported error lands in the server log with its component and its stack", async () => {
  // Arrange
  const file = await logFile();
  const logger = PinoLogger.toConsoleAndFile(file).child("RunStore");

  // Act
  logger.error("Failed to persist run r-1", { error: new Error("disk is full") });

  // Assert
  const [entry] = await logLines(file);
  expect(entry).toMatchObject({
    level: 50,
    component: "RunStore",
    msg: "Failed to persist run r-1",
    error: { message: "disk is full" },
  });
  expect(entry?.error.stack).toContain("disk is full");
});

test("a component named from another component's logger is named once, not nested", async () => {
  // Arrange
  const file = await logFile();
  const store = PinoLogger.toConsoleAndFile(file).child("RunStore");

  // Act
  store.child("RunRepository").warn("Skipping malformed run row");

  // Assert
  const [raw] = (await readFile(file, "utf8")).trim().split(/\r?\n/);
  expect(raw?.match(/"component"/g)).toHaveLength(1);
  expect(raw).toContain('"component":"RunRepository"');
});

async function logFile(): Promise<string> {
  const dir = await mkdtemp(path.join(inject("testTempRoot"), "log-"));
  return path.join(dir, "logs", "server.log");
}

interface LogLine {
  level: number;
  component?: string;
  msg: string;
  error: { message: string; stack: string };
}

async function logLines(file: string): Promise<LogLine[]> {
  const content = await readFile(file, "utf8");
  return content
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line) as LogLine);
}
