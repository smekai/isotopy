import { Hono } from "hono";
import type { RunService } from "../services/run/run-service.ts";

export function createPipelineRoutes(runs: RunService): Hono {
  return new Hono().get("/", (c) => c.json(runs.listPipelines()));
}
