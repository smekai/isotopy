import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { DEFAULT_PIPELINE_ID, RUN_SUMMARY_EVENT, isTerminalRunStatus } from "@adhd/core";
import type { RunEvent } from "@adhd/core";
import type { ProjectRegistry } from "../services/project-registry.ts";
import type { RunService } from "../services/run/run-service.ts";
import {
  postRunMessageSchema,
  resolveLimitSchema,
  restartRunSchema,
  startRunSchema,
} from "../schemas/request-schemas.ts";
import { invalidRequest } from "../domain/validation.ts";
import { listWorkspaceFiles, readWorkspaceFile } from "../utils/workspace-files.ts";
import { revealFolder } from "../utils/reveal-folder.ts";
import { projectScope } from "./project-scope.ts";
import { parseRequestBody } from "./request-body.ts";

const SSE_KEEPALIVE_MS = 15_000;
const SSE_TERMINAL_POLL_MS = 250;

export function createRunRoutes(
  runs: RunService,
  registry: ProjectRegistry,
): Hono {
  return new Hono()
    .get("/", (c) => c.json(runs.listRuns(projectScope(registry, c).id)))

    .get("/events", (c) => {
      const projectId = projectScope(registry, c).id;

      return streamSSE(c, async (stream) => {
        await new Promise<void>((resolve) => {
          const unsubscribe = runs.subscribeProject(projectId, (summary) => {
            void stream.writeSSE({
              event: RUN_SUMMARY_EVENT,
              data: JSON.stringify(summary),
            });
          });
          const keepAlive = setInterval(() => {
            void stream.writeSSE({ event: "ping", data: "" });
          }, SSE_KEEPALIVE_MS);
          keepAlive.unref();
          stream.onAbort(() => {
            clearInterval(keepAlive);
            unsubscribe();
            resolve();
          });
        });
      });
    })

    .get("/:id", (c) => {
      const run = runs.getRun(c.req.param("id"));
      if (!run) {
        return c.json({ error: "Run not found" }, 404);
      }
      return c.json(run);
    })

    .post("/", async (c) => {
      const parsed = await parseRequestBody(c.req, startRunSchema);
      if (!parsed.ok) {
        return c.json(invalidRequest(parsed.issues), 400);
      }
      const body = parsed.value;
      const pipelineId = body.pipelineId ?? DEFAULT_PIPELINE_ID;

      try {
        const run = await runs.startRun(projectScope(registry, c), pipelineId, {
          task: body.task,
          engine: body.engine,
          model: body.model,
          modelTier: body.modelTier,
          permissionMode: body.permissionMode,
          milestoneId: body.milestoneId,
          featureId: body.featureId,
          sourceTaskIds: body.sourceTaskIds,
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
      if (!runs.getRun(runId)) {
        return c.json({ error: "Run not found" }, 404);
      }
      try {
        return c.json(runs.approveGate(runId, stageId));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to approve gate";
        return c.json({ error: message }, 409);
      }
    })

    .post("/:id/limit/:stageId/resolve", async (c) => {
      const runId = c.req.param("id");
      const stageId = c.req.param("stageId");
      if (!runs.getRun(runId)) {
        return c.json({ error: "Run not found" }, 404);
      }
      const parsed = await parseRequestBody(c.req, resolveLimitSchema);
      if (!parsed.ok) {
        return c.json(invalidRequest(parsed.issues), 400);
      }
      try {
        return c.json(runs.resolveLimit(runId, stageId, parsed.value));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to resume the run";
        return c.json({ error: message }, 409);
      }
    })

    .post("/:id/messages", async (c) => {
      const runId = c.req.param("id");
      if (!runs.getRun(runId)) {
        return c.json({ error: "Run not found" }, 404);
      }
      const parsed = await parseRequestBody(c.req, postRunMessageSchema);
      if (!parsed.ok) {
        return c.json(invalidRequest(parsed.issues), 400);
      }
      try {
        return c.json(runs.postMessage(runId, parsed.value.text), 201);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to post message";
        return c.json({ error: message }, 409);
      }
    })

    .post("/:id/abort", (c) => {
      const runId = c.req.param("id");
      if (!runs.getRun(runId)) {
        return c.json({ error: "Run not found" }, 404);
      }
      try {
        return c.json(runs.abortRun(runId));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to abort run";
        return c.json({ error: message }, 409);
      }
    })

    .post("/:id/restart", async (c) => {
      const runId = c.req.param("id");
      if (!runs.getRun(runId)) {
        return c.json({ error: "Run not found" }, 404);
      }
      const parsed = await parseRequestBody(c.req, restartRunSchema);
      if (!parsed.ok) {
        return c.json(invalidRequest(parsed.issues), 400);
      }
      try {
        return c.json(await runs.restartRun(runId, parsed.value.stageId));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to restart run";
        return c.json({ error: message }, 409);
      }
    })

    .get("/:id/files", async (c) => {
      const run = runs.getRun(c.req.param("id"));
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

    .post("/:id/reveal", async (c) => {
      const run = runs.getRun(c.req.param("id"));
      if (!run) {
        return c.json({ error: "Run not found" }, 404);
      }
      const target = run.workspacePath ?? registry.resolve(run.projectId).root;
      try {
        await revealFolder(target);
        return c.json({ path: target });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to open the folder";
        return c.json({ error: message }, 500);
      }
    })

    .get("/:id/files/content", async (c) => {
      const run = runs.getRun(c.req.param("id"));
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
        const status = /escapes the workspace|must be relative/.test(message) ? 400 : 404;
        return c.json({ error: message }, status);
      }
    })

    .get("/:id/events", (c) => {
      const runId = c.req.param("id");
      const run = runs.getRun(runId);
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

        const buffered: RunEvent[] = [];
        let replayed = false;
        const unsubscribe = runs.subscribe(runId, (event) => {
          if (replayed) {
            void send(event);
            return;
          }
          buffered.push(event);
        });

        for (const event of await runs.replayEvents(runId)) {
          await send(event);
        }
        replayed = true;
        for (const event of buffered.splice(0)) {
          await send(event);
        }

        const keepAlive = setInterval(() => {
          void stream.writeSSE({ event: "ping", data: "" });
        }, SSE_KEEPALIVE_MS);

        await new Promise<void>((resolve) => {
          const interval = setInterval(() => {
            const current = runs.getRun(runId);
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
