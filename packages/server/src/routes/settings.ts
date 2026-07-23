import { Hono } from "hono";
import { ENGINES } from "@adhd/core";
import type { EngineId } from "@adhd/core";
import type { ProjectRegistry } from "../services/project-registry.js";
import type { SettingsStore } from "../services/settings-store.js";
import { projectScope } from "./project-scope.js";

interface ConnectionUpdateBody {
  connectionMode?: string;
  apiKey?: string | null;
}

export function createSettingsRoutes(
  registry: ProjectRegistry,
  settings: SettingsStore,
): Hono {
  return new Hono()
    .get("/", (c) => c.json(settings.getSettingsView(projectScope(registry, c).id)))

    .put("/engines/:engineId", async (c) => {
      const engineId = c.req.param("engineId");
      if (!(engineId in ENGINES)) {
        return c.json({ error: `Unknown engine: ${engineId}` }, 400);
      }
      const id = engineId as EngineId;
      const body = await c.req
        .json<ConnectionUpdateBody>()
        .catch(() => ({}) as ConnectionUpdateBody);
      if (body.connectionMode !== undefined) {
        const known = ENGINES[id].connections.some((mode) => mode.id === body.connectionMode);
        if (!known) {
          return c.json(
            { error: `Unknown connection mode for ${id}: ${body.connectionMode}` },
            400,
          );
        }
      }
      return c.json(
        settings.updateEngineConnection(projectScope(registry, c).id, id, body),
      );
    });
}
