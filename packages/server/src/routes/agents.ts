import { Hono } from "hono";
import { installPackRequestSchema } from "@isotopy/core";
import { catalogEntries } from "../domain/rules/agent-catalog.ts";
import { invalidRequest } from "../domain/validation.ts";
import type { AgentCatalog } from "../services/agent-catalog.ts";
import type { PackInstaller } from "../services/pack-installer.ts";
import type { ProjectRegistry } from "../services/project-registry.ts";
import { projectScope } from "./project-scope.ts";
import { parseRequestBody } from "./request-body.ts";

const PACK_CONFLICT = "The pack conflicts with files in this project";

const PACK_BUSY = "Another pack is being installed into this project";

export function createAgentRoutes(
  agents: AgentCatalog,
  packs: PackInstaller,
  registry: ProjectRegistry,
): Hono {
  return new Hono()
    .get("/", async (c) => c.json(catalogEntries(await agents.catalog(projectScope(registry, c)))))
    .post("/packs", async (c) => {
      const parsed = await parseRequestBody(c.req, installPackRequestSchema);
      if (!parsed.ok) {
        return c.json(invalidRequest(parsed.issues), 400);
      }
      const outcome = await packs.install(projectScope(registry, c), parsed.value);
      switch (outcome.kind) {
        case "installed":
          return c.json(outcome.result);
        case "invalid":
          return c.json(invalidRequest(outcome.issues), 400);
        case "conflict":
          return c.json({ error: PACK_CONFLICT, issues: outcome.issues }, 409);
        case "busy":
          return c.json({ error: PACK_BUSY }, 409);
      }
    });
}
