import { Hono } from "hono";
import { ENGINES } from "@isotopy/core";
import type { EngineId, EngineStatus } from "@isotopy/core";
import { findEngineAdapter } from "../engines/registry.ts";
import type { ModelRosterService } from "../services/model-roster-service.ts";

function knownEngine(engineId: string): EngineId | undefined {
  return engineId in ENGINES ? (engineId as EngineId) : undefined;
}

function unknownEngine(engineId: string) {
  return { error: `Unknown engine: ${engineId}` } as const;
}

export function createEngineRoutes(rosters: ModelRosterService): Hono {
  return new Hono()
    .get("/:engineId/status", async (c) => {
      const id = knownEngine(c.req.param("engineId"));
      if (!id) {
        return c.json(unknownEngine(c.req.param("engineId")), 400);
      }
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
      const id = knownEngine(c.req.param("engineId"));
      if (!id) {
        return c.json(unknownEngine(c.req.param("engineId")), 400);
      }
      const rechecking = c.req.query("refresh") === "1";
      return c.json(await (rechecking ? rosters.refresh(id) : rosters.roster(id)));
    })

    .post("/:engineId/install", async (c) => {
      const id = knownEngine(c.req.param("engineId"));
      if (!id) {
        return c.json(unknownEngine(c.req.param("engineId")), 400);
      }
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
      const id = knownEngine(c.req.param("engineId"));
      if (!id) {
        return c.json(unknownEngine(c.req.param("engineId")), 400);
      }
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
