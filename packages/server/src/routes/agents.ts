import { Hono } from "hono";
import { catalogEntries } from "../domain/rules/agent-catalog.ts";
import type { AgentCatalog } from "../services/agent-catalog.ts";
import type { ProjectRegistry } from "../services/project-registry.ts";
import { projectScope } from "./project-scope.ts";

export function createAgentRoutes(agents: AgentCatalog, registry: ProjectRegistry): Hono {
  return new Hono().get("/", async (c) =>
    c.json(catalogEntries(await agents.catalog(projectScope(registry, c)))),
  );
}
