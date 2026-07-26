import type { Context } from "hono";
import type { ProjectRegistry } from "../services/project-registry.ts";
import type { ProjectPath } from "../paths.ts";

export const PROJECT_HEADER = "X-ADHD-Project";

export function projectScope(registry: ProjectRegistry, c: Context): ProjectPath {
  return registry.resolve(c.req.header(PROJECT_HEADER));
}
