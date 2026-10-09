import { execFileSync } from "node:child_process";

export function lookupOnPath(command: string): string | undefined {
  const [lookup, query] =
    process.platform === "win32" ? ["where", `$PATH:${command}`] : ["which", command];
  try {
    return execFileSync(lookup, [query], { encoding: "utf8" });
  } catch {
    return undefined;
  }
}
