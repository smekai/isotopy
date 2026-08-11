import { Hono } from "hono";
import {
  approveTeamSchema,
  startOrchestrationSchema,
} from "../schemas/request-schemas.ts";
import { invalidRequest } from "../domain/validation.ts";
import type { OrchestrationService } from "../services/orchestration-service.ts";
import type { ProjectRegistry } from "../services/project-registry.ts";
import { projectScope } from "./project-scope.ts";
import { parseRequestBody } from "./request-body.ts";

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Orchestration operation failed";
}

export function createOrchestrationRoutes(
  orchestrations: OrchestrationService,
  registry: ProjectRegistry,
): Hono {
  return new Hono()
    .get("/", (c) =>
      c.json(orchestrations.list(projectScope(registry, c).id)),
    )
    .post("/", async (c) => {
      const parsed = await parseRequestBody(c.req, startOrchestrationSchema);
      if (!parsed.ok) {
        return c.json(invalidRequest(parsed.issues), 400);
      }
      const body = parsed.value;
      try {
        return c.json(
          await orchestrations.start(projectScope(registry, c), body.goal, {
            engine: body.engine,
            model: body.model,
            modelTier: body.modelTier,
            permissionMode: body.permissionMode,
          }),
          201,
        );
      } catch (error) {
        return c.json({ error: messageOf(error) }, 400);
      }
    })
    .get("/:id", (c) => {
      const project = projectScope(registry, c);
      const orchestration = orchestrations.get(c.req.param("id"));
      return !orchestration || orchestration.projectId !== project.id
        ? c.json({ error: "Orchestration not found" }, 404)
        : c.json(orchestration);
    })
    .post("/:id/approve", async (c) => {
      const parsed = await parseRequestBody(c.req, approveTeamSchema);
      if (!parsed.ok) {
        return c.json(invalidRequest(parsed.issues), 400);
      }
      const project = projectScope(registry, c);
      const orchestration = orchestrations.get(c.req.param("id"));
      if (!orchestration || orchestration.projectId !== project.id) {
        return c.json({ error: "Orchestration not found" }, 404);
      }
      const body = parsed.value;
      try {
        const started = await orchestrations.approveTeam(
          project,
          orchestration.id,
          {
            engine: body.engine,
            model: body.model,
            modelTier: body.modelTier,
            roleTiers: body.roleTiers,
            permissionMode: body.permissionMode,
          },
        );
        return started.ok
          ? c.json(started.value, 201)
          : c.json(invalidRequest(started.issues), 400);
      } catch (error) {
        return c.json({ error: messageOf(error) }, 400);
      }
    })
    .post("/:id/stop", async (c) => {
      const project = projectScope(registry, c);
      const orchestration = orchestrations.get(c.req.param("id"));
      if (!orchestration || orchestration.projectId !== project.id) {
        return c.json({ error: "Orchestration not found" }, 404);
      }
      try {
        return c.json(await orchestrations.stop(project, orchestration.id));
      } catch (error) {
        return c.json({ error: messageOf(error) }, 400);
      }
    });
}
