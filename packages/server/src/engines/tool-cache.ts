import path from "node:path";

export function toolCacheEnv(toolCacheDir: string): NodeJS.ProcessEnv {
  return { PLAYWRIGHT_BROWSERS_PATH: path.join(toolCacheDir, "ms-playwright") };
}
