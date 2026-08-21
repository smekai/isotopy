import type { ZodType } from "zod";

export function parsePersistedRecord<T>(
  schema: ZodType<T>,
  data: string,
): T | undefined {
  try {
    const parsed = schema.safeParse(JSON.parse(data));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
