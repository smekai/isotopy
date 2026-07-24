import type { Context } from "hono";
import type { ProjectRegistry } from "../services/project-registry.ts";
import type { ProjectPaths } from "../paths.ts";

export const PROJECT_HEADER = "X-ADHD-Project";

export function projectScope(registry: ProjectRegistry, c: Context): ProjectPaths {
  return registry.resolve(c.req.header(PROJECT_HEADER));
}
