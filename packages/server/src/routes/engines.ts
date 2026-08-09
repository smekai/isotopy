import { Hono } from "hono";
import { ENGINES } from "@adhd/core";
import type { EngineId, EngineStatus } from "@adhd/core";
import { findEngineAdapter } from "../engines/registry.ts";
import type { ModelRosterService } from "../services/model-roster-service.ts";

export function createEngineRoutes(rosters: ModelRosterService): Hono {
  return new Hono()
    .get("/:engineId/status", async (c) => {
      const engineId = c.req.param("engineId");
      if (!(engineId in ENGINES)) {
        return c.json({ error: `Unknown engine: ${engineId}` }, 400);
      }
      const id = engineId as EngineId;
      const adapter = findEngineAdapter(id);
      if (!adapter?.detect) {
        const status: EngineStatus = {
          engine: id,
          installed: false,
          message: `Engine "${ENGINES[id].label}" is not implemented yet`,
        };
        return c.json(status);
      }
      return c.json(await adapter.detect());
    })
    .get("/:engineId/models", async (c) => {
      const engineId = c.req.param("engineId");
      if (!(engineId in ENGINES)) {
        return c.json({ error: `Unknown engine: ${engineId}` }, 400);
      }
      const id = engineId as EngineId;
      const rechecking = c.req.query("refresh") === "1";
      return c.json(rechecking ? await rosters.refresh(id) : await rosters.roster(id));
    })
    .post("/:engineId/install", async (c) => {
      const engineId = c.req.param("engineId");
      if (!(engineId in ENGINES)) {
        return c.json({ error: `Unknown engine: ${engineId}` }, 400);
      }
      const id = engineId as EngineId;
      const adapter = findEngineAdapter(id);
      if (!adapter?.install) {
        return c.json({ error: `Auto-install is not available for "${ENGINES[id].label}"` }, 400);
      }
      const result = await adapter.install();
      if (result.ok) {
        rosters.invalidate(id);
      }
      return c.json(result);
    })
    .post("/:engineId/login", async (c) => {
      const engineId = c.req.param("engineId");
      if (!(engineId in ENGINES)) {
        return c.json({ error: `Unknown engine: ${engineId}` }, 400);
      }
      const id = engineId as EngineId;
      const adapter = findEngineAdapter(id);
      if (!adapter?.login) {
        return c.json({ error: `Login is not available for "${ENGINES[id].label}"` }, 400);
      }
      const result = await adapter.login();
      if (result.ok) {
        rosters.invalidate(id);
      }
      return c.json(result);
    });
}
