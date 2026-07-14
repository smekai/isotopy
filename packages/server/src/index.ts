import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import type { RunEvent, RunStatus } from "@adhd/core";
import { orchestrator } from "./mock-orchestrator.js";

const PORT = Number(process.env.PORT ?? 9477);
const app = new Hono();

const TERMINAL_RUN_STATUSES: RunStatus[] = ["completed", "failed", "cancelled"];

app.use(
  "/*",
  cors({
    origin: ["http://localhost:5173", "http://localhost:9477"],
  }),
);

app.get("/health", (c) => c.json({ ok: true, service: "adhd-server" }));

app.get("/pipelines", (c) => c.json(orchestrator.listPipelines()));

app.get("/runs", (c) => c.json(orchestrator.listRuns()));

app.get("/runs/:id", (c) => {
  const run = orchestrator.getRun(c.req.param("id"));
  if (!run) {
    return c.json({ error: "Run not found" }, 404);
  }
  return c.json(run);
});

app.post("/runs", async (c) => {
  const body = await c.req
    .json<{
      pipelineId?: string;
      task?: string;
      disabledStages?: string[];
      engine?: string;
      model?: string;
      workspaceDir?: string;
      permissionMode?: string;
      failProbability?: number;
      minDurationMs?: number;
      maxDurationMs?: number;
    }>()
    .catch(() => ({}) as Record<string, never>);
  const pipelineId = body.pipelineId ?? "sequential";

  try {
    const run = await orchestrator.startRun(pipelineId, {
      task: body.task,
      disabledStages: body.disabledStages,
      engine: body.engine,
      model: body.model,
      workspaceDir: body.workspaceDir,
      permissionMode: body.permissionMode,
      ...(body.failProbability !== undefined
        ? { failProbability: body.failProbability }
        : {}),
      ...(body.minDurationMs !== undefined
        ? { minDurationMs: body.minDurationMs }
        : {}),
      ...(body.maxDurationMs !== undefined
        ? { maxDurationMs: body.maxDurationMs }
        : {}),
    });
    return c.json(run, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start run";
    return c.json({ error: message }, 400);
  }
});

app.post("/runs/:id/gates/:stageId/approve", (c) => {
  const runId = c.req.param("id");
  const stageId = c.req.param("stageId");
  if (!orchestrator.getRun(runId)) {
    return c.json({ error: "Run not found" }, 404);
  }
  try {
    return c.json(orchestrator.approveGate(runId, stageId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to approve gate";
    return c.json({ error: message }, 409);
  }
});

app.post("/runs/:id/abort", (c) => {
  const runId = c.req.param("id");
  if (!orchestrator.getRun(runId)) {
    return c.json({ error: "Run not found" }, 404);
  }
  try {
    return c.json(orchestrator.abortRun(runId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to abort run";
    return c.json({ error: message }, 409);
  }
});

app.post("/runs/:id/restart", async (c) => {
  const runId = c.req.param("id");
  if (!orchestrator.getRun(runId)) {
    return c.json({ error: "Run not found" }, 404);
  }
  const body = await c.req
    .json<{ stageId?: string }>()
    .catch(() => ({}) as Record<string, never>);
  if (!body.stageId) {
    return c.json({ error: "stageId is required" }, 400);
  }
  try {
    return c.json(orchestrator.restartRun(runId, body.stageId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to restart run";
    return c.json({ error: message }, 409);
  }
});

app.get("/runs/:id/events", (c) => {
  const runId = c.req.param("id");
  const run = orchestrator.getRun(runId);
  if (!run) {
    return c.json({ error: "Run not found" }, 404);
  }

  return streamSSE(c, async (stream) => {
    const send = async (event: RunEvent) => {
      await stream.writeSSE({
        event: event.type,
        data: JSON.stringify(event),
      });
    };

    const unsubscribe = orchestrator.subscribe(runId, (event) => {
      void send(event);
    });

    const keepAlive = setInterval(() => {
      void stream.writeSSE({ event: "ping", data: "" });
    }, 15000);

    await new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        const current = orchestrator.getRun(runId);
        if (current && TERMINAL_RUN_STATUSES.includes(current.status)) {
          clearInterval(interval);
          clearInterval(keepAlive);
          unsubscribe();
          resolve();
        }
      }, 250);
    });

    await stream.close();
  });
});

serve(
  {
    fetch: app.fetch,
    port: PORT,
  },
  (info) => {
    console.log(`ADHD server listening on http://localhost:${info.port}`);
  },
);
