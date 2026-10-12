import { parse as parseYamlText } from "yaml";
import type { ZodError, ZodType } from "zod";
import { messageOf } from "../utils/message-of.ts";

export interface ValidationIssue {
  path: (string | number)[];
  message: string;
}

export interface InvalidInput {
  error: "Invalid request";
  issues: ValidationIssue[];
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: ValidationIssue[] };

export function validationIssues(error: ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.filter(
      (part): part is string | number =>
        typeof part === "string" || typeof part === "number",
    ),
    message: issue.message,
  }));
}

export function validate<T>(
  schema: ZodType<T>,
  input: unknown,
): ValidationResult<T> {
  const parsed = schema.safeParse(input);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, issues: validationIssues(parsed.error) };
}

export function parseJson<T>(
  schema: ZodType<T>,
  text: string,
): ValidationResult<T> {
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    return {
      ok: false,
      issues: [{ path: [], message: "Value must be valid JSON" }],
    };
  }
  return validate(schema, input);
}

export function parseYaml<T>(
  schema: ZodType<T>,
  text: string,
): ValidationResult<T> {
  let input: unknown;
  try {
    input = parseYamlText(text, { maxAliasCount: 0, uniqueKeys: true });
  } catch (error) {
    return {
      ok: false,
      issues: [{ path: [], message: `Value must be valid YAML: ${messageOf(error)}` }],
    };
  }
  return validate(schema, input);
}

export function invalidRequest(issues: ValidationIssue[]): InvalidInput {
  return { error: "Invalid request", issues };
}

export function formatValidationIssues(issues: ValidationIssue[]): string {
  return issues
    .map(({ path, message }) => `${path.length > 0 ? path.join(".") : "value"}: ${message}`)
    .join("; ");
}
