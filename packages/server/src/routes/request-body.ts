import type { ZodType } from "zod";
import { validate } from "../domain/validation.ts";
import type { ValidationResult } from "../domain/validation.ts";

interface JsonRequest {
  json(): Promise<unknown>;
}

export async function parseRequestBody<T>(
  request: JsonRequest,
  schema: ZodType<T>,
): Promise<ValidationResult<T>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return {
      ok: false,
      issues: [{ path: [], message: "Request body must be valid JSON" }],
    };
  }
  return validate(schema, body);
}
