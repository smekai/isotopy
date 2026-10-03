import { execFileSync } from "node:child_process";

export function lookupOnPath(command: string): string | undefined {
  const lookup = process.platform === "win32" ? "where" : "which";
  try {
    return execFileSync(lookup, [command], { encoding: "utf8" });
  } catch {
    return undefined;
  }
}
