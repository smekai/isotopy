import { Hono } from "hono";
import { ENGINES, modelOptionsFor } from "@adhd/core";
import type { EngineId, EngineModelList, EngineStatus } from "@adhd/core";
import { findEngineAdapter } from "../engines/registry.ts";

export const engineRoutes = new Hono()
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
    const fallback: EngineModelList = { options: modelOptionsFor(id), source: "static" };
    const adapter = findEngineAdapter(id);
    if (!adapter?.listModels) {
      return c.json(fallback);
    }
    try {
      return c.json(await adapter.listModels());
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return c.json({ ...fallback, note: `Model lookup failed (${reason}).` });
    }
  })
  .post("/:engineId/install", async (c) => {
    const engineId = c.req.param("engineId");
    if (!(engineId in ENGINES)) {
      return c.json({ error: `Unknown engine: ${engineId}` }, 400);
    }
    const adapter = findEngineAdapter(engineId as EngineId);
    if (!adapter?.install) {
      return c.json({ error: `Auto-install is not available for "${ENGINES[engineId as EngineId].label}"` }, 400);
    }
    return c.json(await adapter.install());
  })
  .post("/:engineId/login", async (c) => {
    const engineId = c.req.param("engineId");
    if (!(engineId in ENGINES)) {
      return c.json({ error: `Unknown engine: ${engineId}` }, 400);
    }
    const adapter = findEngineAdapter(engineId as EngineId);
    if (!adapter?.login) {
      return c.json({ error: `Login is not available for "${ENGINES[engineId as EngineId].label}"` }, 400);
    }
    return c.json(await adapter.login());
  });
