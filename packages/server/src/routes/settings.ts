import { Hono } from "hono";
import { ENGINES } from "@adhd/core";
import type { EngineId } from "@adhd/core";
import { getSettingsView, updateEngineConnection } from "../settings.js";

export const settingsRoutes = new Hono()
  .get("/", (c) => c.json(getSettingsView()))

  .put("/engines/:engineId", async (c) => {
    const engineId = c.req.param("engineId");
    if (!(engineId in ENGINES)) {
      return c.json({ error: `Unknown engine: ${engineId}` }, 400);
    }
    const id = engineId as EngineId;
    const body = await c.req
      .json<{ connectionMode?: string; apiKey?: string | null }>()
      .catch(() => ({}) as Record<string, never>);
    if (body.connectionMode !== undefined) {
      const known = ENGINES[id].connections.some((mode) => mode.id === body.connectionMode);
      if (!known) {
        return c.json(
          { error: `Unknown connection mode for ${id}: ${body.connectionMode}` },
          400,
        );
      }
    }
    return c.json(updateEngineConnection(id, body));
  });
