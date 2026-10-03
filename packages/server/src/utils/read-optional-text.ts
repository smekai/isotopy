import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { errorCodeOf } from "./error-code.ts";
import { messageOf } from "./message-of.ts";

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

function absentOrThrow(file: string, error: unknown): undefined {
  if (errorCodeOf(error) === "ENOENT") {
    return undefined;
  }
  throw new Error(`Cannot read ${file}: ${messageOf(error)}`, { cause: error });
}
