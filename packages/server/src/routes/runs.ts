import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { isTerminalRunStatus } from "@adhd/core";
import type { RunEvent } from "@adhd/core";
import type { RunOrchestrator } from "../services/run-orchestrator.js";
import { listWorkspaceFiles, readWorkspaceFile } from "../services/workspace-files.js";

const SSE_KEEPALIVE_MS = 15_000;
const SSE_TERMINAL_POLL_MS = 250;

/**
 * Run controller. Takes its orchestrator rather than importing a singleton, so
 * a test can mount these routes against a throwaway instance.
 */
export function createRunRoutes(orchestrator: RunOrchestrator): Hono {
  return new Hono()
    .get("/", (c) => c.json(orchestrator.listRuns()))

    .get("/:id", (c) => {
      const run = orchestrator.getRun(c.req.param("id"));
      if (!run) {
        return c.json({ error: "Run not found" }, 404);
      }
      return c.json(run);
    })

    .post("/", async (c) => {
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
    })

    .post("/:id/gates/:stageId/approve", (c) => {
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
    })

    .post("/:id/abort", (c) => {
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
    })

    .post("/:id/restart", async (c) => {
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
    })

    .get("/:id/files", async (c) => {
      const run = orchestrator.getRun(c.req.param("id"));
      if (!run) {
        return c.json({ error: "Run not found" }, 404);
      }
      if (!run.workspacePath) {
        return c.json({ files: [] });
      }
      try {
        return c.json({ files: await listWorkspaceFiles(run.workspacePath) });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to list workspace";
        return c.json({ error: message }, 500);
      }
    })

    .get("/:id/files/content", async (c) => {
      const run = orchestrator.getRun(c.req.param("id"));
      if (!run) {
        return c.json({ error: "Run not found" }, 404);
      }
      const filePath = c.req.query("path");
      if (!filePath) {
        return c.json({ error: "path is required" }, 400);
      }
      if (!run.workspacePath) {
        return c.json({ error: "Run has no workspace" }, 404);
      }
      try {
        return c.json(await readWorkspaceFile(run.workspacePath, filePath));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to read file";
        // Traversal attempts are rejected, not reported as missing files.
        const status = /escapes the workspace|must be relative/.test(message) ? 400 : 404;
        return c.json({ error: message }, status);
      }
    })

    .get("/:id/events", (c) => {
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
        }, SSE_KEEPALIVE_MS);

        await new Promise<void>((resolve) => {
          const interval = setInterval(() => {
            const current = orchestrator.getRun(runId);
            if (current && isTerminalRunStatus(current.status)) {
              clearInterval(interval);
              clearInterval(keepAlive);
              unsubscribe();
              resolve();
            }
          }, SSE_TERMINAL_POLL_MS);
        });

        await stream.close();
      });
    });
}
