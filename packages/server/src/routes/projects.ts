import { Hono } from "hono";
import { addProjectSchema } from "../schemas/request-schemas.ts";
import { invalidRequest } from "../domain/validation.ts";
import type { ProductProcessService } from "../services/product-process-service.ts";
import type { ScheduleService } from "../services/schedule-service.ts";
import type { ProjectRegistry } from "../services/project-registry.ts";
import { messageOf } from "../utils/message-of.ts";
import { parseRequestBody } from "./request-body.ts";

export function createProjectRoutes(
  registry: ProjectRegistry,
  product: ProductProcessService,
  schedules: ScheduleService,
): Hono {
  return new Hono()
    .get("/", (c) => c.json(registry.list()))

    .post("/", async (c) => {
      const parsed = await parseRequestBody(c.req, addProjectSchema);
      if (!parsed.ok) {
        return c.json(invalidRequest(parsed.issues), 400);
      }
      try {
        const project = await registry.add(parsed.value.root);
        return c.json({ project, ...registry.list() }, 201);
      } catch (error) {
        return c.json({ error: messageOf(error) }, 400);
      }
    })

    .post("/:id/activate", async (c) => {
      try {
        const projects = registry.activate(c.req.param("id"));
        await product.stopUnless(c.req.param("id"));
        return c.json(projects);
      } catch (error) {
        return c.json({ error: messageOf(error) }, 404);
      }
    })

    .delete("/:id", async (c) => {
      try {
        const projects = registry.unregister(c.req.param("id"));
        schedules.unloadProject(c.req.param("id"));
        await product.stopFor(c.req.param("id"));
        return c.json(projects);
      } catch (error) {
        return c.json({ error: messageOf(error) }, 400);
      }
    });
}
