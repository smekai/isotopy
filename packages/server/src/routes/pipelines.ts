import { Hono } from "hono";
import type { RunOrchestrator } from "../services/run-orchestrator.js";

export function createPipelineRoutes(orchestrator: RunOrchestrator): Hono {
  return new Hono().get("/", (c) => c.json(orchestrator.listPipelines()));
}
