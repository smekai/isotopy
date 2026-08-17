import path from "node:path";

export function toolCacheEnv(toolCacheDir: string | undefined): NodeJS.ProcessEnv {
  return toolCacheDir === undefined
    ? {}
    : { PLAYWRIGHT_BROWSERS_PATH: path.join(toolCacheDir, "ms-playwright") };
}
