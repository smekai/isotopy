import type { PlatformCommand } from "@adhd/core";
import { runSubprocess } from "../engines/subprocess.ts";
import type { SubprocessResult, SubprocessSpec } from "../engines/subprocess.ts";

const REVEAL_TIMEOUT_MS = 10_000;

type SubprocessRunner = (spec: SubprocessSpec) => Promise<SubprocessResult>;

export interface RevealFolderDependencies {
  platform: NodeJS.Platform;
  run: SubprocessRunner;
}

export function revealCommand(
  platform: NodeJS.Platform,
  target: string,
): PlatformCommand {
  if (platform === "win32") {
    return { executable: "explorer.exe", args: [target] };
  }
  if (platform === "darwin") {
    return { executable: "open", args: [target] };
  }
  return { executable: "xdg-open", args: [target] };
}

export async function revealFolder(
  target: string,
  deps: Partial<RevealFolderDependencies> = {},
): Promise<void> {
  const platform = deps.platform ?? process.platform;
  const run = deps.run ?? runSubprocess;
  const command = revealCommand(platform, target);
  const result = await run({
    command: command.executable,
    args: command.args,
    cwd: target,
    timeoutMs: REVEAL_TIMEOUT_MS,
  });
  if (platform === "win32" || result.success) {
    return;
  }
  throw new Error(
    result.errorMessage ?? `${command.executable} could not open the folder`,
  );
}
