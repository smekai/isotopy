import { Hono } from "hono";
import { orchestrator } from "../services/run-orchestrator.js";

export const pipelineRoutes = new Hono().get("/", (c) =>
  c.json(orchestrator.listPipelines()),
);
