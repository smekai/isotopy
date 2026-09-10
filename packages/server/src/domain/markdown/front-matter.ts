import { markdownBody } from "./format.ts";
import type { ValidationIssue, ValidationResult } from "../validation.ts";

export type FrontMatterValue = string | string[];

export interface FrontMatterDocument {
  fields: Record<string, FrontMatterValue>;
  body: string;
}

type ValueReading = { value: FrontMatterValue } | { refusal: string };

const FENCE = "---";

const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

const KEY_LINE = /^([A-Za-z][A-Za-z0-9]*):(.*)$/;

const QUOTED = /^(["'])(.*)\1$/s;

export function splitFrontMatter(source: string): ValidationResult<FrontMatterDocument> {
  const text = withoutByteOrderMark(source);
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== FENCE) {
    return { ok: true, value: { fields: {}, body: markdownBody(text) } };
  }
  const closing = lines.findIndex((line, index) => index > 0 && line.trim() === FENCE);
  if (closing === -1) {
    return {
      ok: false,
      issues: [{ path: ["frontMatter"], message: "Front matter is never closed by a `---` line" }],
    };
  }
  const fields: Record<string, FrontMatterValue> = {};
  const issues: ValidationIssue[] = [];
  for (const [offset, line] of lines.slice(1, closing).entries()) {
    const refusal = readInto(fields, line);
    if (refusal !== undefined) {
      issues.push({ path: ["frontMatter", offset + 2], message: refusal });
    }
  }
  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return {
    ok: true,
    value: { fields, body: markdownBody(lines.slice(closing + 1).join("\n")) },
  };
}

function withoutByteOrderMark(source: string): string {
  return source.startsWith(BYTE_ORDER_MARK) ? source.slice(BYTE_ORDER_MARK.length) : source;
}

function readInto(fields: Record<string, FrontMatterValue>, line: string): string | undefined {
  if (line.trim() === "") {
    return undefined;
  }
  const shape = unreadableShape(line);
  if (shape !== undefined) {
    return shape;
  }
  const match = KEY_LINE.exec(line);
  if (!match?.[1]) {
    return `Expected \`key: value\`, found: ${line.trim()}`;
  }
  const key = match[1];
  if (key in fields) {
    return `Duplicate key: ${key}`;
  }
  const reading = readValue(match[2] ?? "");
  if ("refusal" in reading) {
    return `\`${key}\` ${reading.refusal}`;
  }
  fields[key] = reading.value;
  return undefined;
}

function unreadableShape(line: string): string | undefined {
  if (/^\s/.test(line)) {
    return "Indented lines are not read; write one `key: value` per line";
  }
  if (line.startsWith("#")) {
    return "Front matter carries no comments";
  }
  if (line.startsWith("-")) {
    return "Write a list inline as `key: [one, two]`, not as `- item`";
  }
  return undefined;
}

function readValue(raw: string): ValueReading {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { refusal: "has no value" };
  }
  if (trimmed.startsWith("|") || trimmed.startsWith(">")) {
    return { refusal: "uses a block scalar, which front matter here does not read" };
  }
  return trimmed.startsWith("[") ? readList(trimmed) : { value: unquote(trimmed) };
}

function readList(trimmed: string): ValueReading {
  if (!trimmed.endsWith("]")) {
    return { refusal: "opens a list that is never closed by `]`" };
  }
  const inner = trimmed.slice(1, -1).trim();
  if (inner === "") {
    return { value: [] };
  }
  const entries = inner.split(",").map((entry) => unquote(entry.trim()));
  return entries.some((entry) => entry === "")
    ? { refusal: "lists an empty entry" }
    : { value: entries };
}

function unquote(value: string): string {
  return QUOTED.exec(value)?.[2] ?? value;
}
