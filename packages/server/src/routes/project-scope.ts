import type { Context } from "hono";
import { PROJECT_HEADER } from "@isotopy/core";
import type { ProjectRegistry } from "../services/project-registry.ts";
import type { ProjectPath } from "../paths.ts";

export const PROJECT_QUERY = "project";

export function projectScope(registry: ProjectRegistry, c: Context): ProjectPath {
  return registry.resolve(c.req.header(PROJECT_HEADER) ?? c.req.query(PROJECT_QUERY));
}
