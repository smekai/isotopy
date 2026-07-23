import type { Context } from "hono";
import type { ProjectRegistry } from "../services/project-registry.js";
import type { ProjectPaths } from "../paths.js";

export const PROJECT_HEADER = "X-ADHD-Project";

export function projectScope(registry: ProjectRegistry, c: Context): ProjectPaths {
  return registry.resolve(c.req.header(PROJECT_HEADER));
}
