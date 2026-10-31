import { Hono } from "hono";
import {
  approveTeamChangeSchema,
  postRunMessageSchema,
  startOrchestrationSchema,
} from "../schemas/request-schemas.ts";
import { invalidRequest } from "../domain/validation.ts";
import type { OrchestrationService } from "../services/orchestration-service.ts";
import type { ProjectRegistry } from "../services/project-registry.ts";
import { messageOf } from "../utils/message-of.ts";
import { projectScope } from "./project-scope.ts";
import { parseRequestBody } from "./request-body.ts";

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
      const parsed = await parseRequestBody(c.req, approveTeamChangeSchema);
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
        const started = await orchestrations.approveTeamChange(project, orchestration.id, {
          engine: body.engine,
          model: body.model,
          modelTier: body.modelTier,
          permissionMode: body.permissionMode,
        });
        return c.json(started, 201);
      } catch (error) {
        return c.json({ error: messageOf(error) }, 400);
      }
    })
    .post("/:id/messages", async (c) => {
      const parsed = await parseRequestBody(c.req, postRunMessageSchema);
      if (!parsed.ok) {
        return c.json(invalidRequest(parsed.issues), 400);
      }
      const project = projectScope(registry, c);
      const orchestration = orchestrations.get(c.req.param("id"));
      if (!orchestration || orchestration.projectId !== project.id) {
        return c.json({ error: "Orchestration not found" }, 404);
      }
      try {
        return c.json(
          await orchestrations.answer(project, orchestration.id, parsed.value.text),
          201,
        );
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
