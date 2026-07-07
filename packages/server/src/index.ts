import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import type { RunEvent } from "@adhd/core";
import { orchestrator } from "./mock-orchestrator.js";

const PORT = Number(process.env.PORT ?? 9477);
const app = new Hono();

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
  const body = await c.req.json<{ pipelineId?: string }>().catch(() => ({}));
  const pipelineId = body.pipelineId ?? "sequential";

  try {
    const run = await orchestrator.startRun(pipelineId);
    return c.json(run, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start run";
    return c.json({ error: message }, 400);
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

    for (const stage of run.stages) {
      for (const line of stage.logs) {
        await send({
          ts: new Date().toISOString(),
          type: "stage.log",
          runId,
          stageId: stage.id,
          message: line,
        });
      }
    }

    const unsubscribe = orchestrator.subscribe(runId, (event) => {
      void send(event);
    });

    const keepAlive = setInterval(() => {
      void stream.writeSSE({ event: "ping", data: "" });
    }, 15000);

    await new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        const current = orchestrator.getRun(runId);
        if (
          current &&
          (current.status === "completed" || current.status === "failed")
        ) {
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
