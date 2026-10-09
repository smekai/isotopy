import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { errorCodeOf } from "./error-code.ts";
import { messageOf } from "./message-of.ts";

export interface TextFileOptions {
  mode?: number;
}

export function readOptionalTextSync(file: string): string | undefined {
  try {
    return readFileSync(file, "utf8");
  } catch (error) {
    return absentOrThrow(file, error);
  }
}

export async function readOptionalText(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    return absentOrThrow(file, error);
  }
}

export async function writeTextFile(
  file: string,
  text: string,
  options: TextFileOptions = {},
): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = temporaryFor(file);
  await writeFile(temporary, withLineEndings(text), { encoding: "utf8", mode: options.mode });
  await rename(temporary, file);
}

export function writeTextFileSync(file: string, text: string, options: TextFileOptions = {}): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = temporaryFor(file);
  writeFileSync(temporary, withLineEndings(text), { encoding: "utf8", mode: options.mode });
  renameSync(temporary, file);
}

function absentOrThrow(file: string, error: unknown): undefined {
  if (errorCodeOf(error) === "ENOENT") {
    return undefined;
  }
  throw new Error(`Cannot read ${file}: ${messageOf(error)}`, { cause: error });
}

function temporaryFor(file: string): string {
  return `${file}.${randomUUID()}.tmp`;
}

function withLineEndings(text: string): string {
  const lf = text.replace(/\r\n?/g, "\n");
  return lf === "" || lf.endsWith("\n") ? lf : `${lf}\n`;
}
