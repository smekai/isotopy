import { Hono } from "hono";
import { ENGINES } from "@adhd/core";
import type { EngineId } from "@adhd/core";
import {
  engineConnectionUpdateSchema,
  projectPreferencesUpdateSchema,
} from "../schemas/request-schemas.ts";
import { invalidRequest } from "../domain/validation.ts";
import type { ProjectRegistry } from "../services/project-registry.ts";
import type { SettingsStore } from "../services/settings-store.ts";
import { projectScope } from "./project-scope.ts";
import { parseRequestBody } from "./request-body.ts";

export function createSettingsRoutes(
  registry: ProjectRegistry,
  settings: SettingsStore,
): Hono {
  return new Hono()
    .get("/", (c) => c.json(settings.getSettingsView(projectScope(registry, c).id)))

    .put("/preferences", async (c) => {
      const parsed = await parseRequestBody(c.req, projectPreferencesUpdateSchema);
      if (!parsed.ok) {
        return c.json(invalidRequest(parsed.issues), 400);
      }
      return c.json(
        settings.updatePreferences(projectScope(registry, c).id, parsed.value),
      );
    })

    .put("/engines/:engineId", async (c) => {
      const engineId = c.req.param("engineId");
      if (!(engineId in ENGINES)) {
        return c.json({ error: `Unknown engine: ${engineId}` }, 400);
      }
      const id = engineId as EngineId;
      const parsed = await parseRequestBody(c.req, engineConnectionUpdateSchema);
      if (!parsed.ok) {
        return c.json(invalidRequest(parsed.issues), 400);
      }
      const body = parsed.value;
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
