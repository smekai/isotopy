import { Hono } from "hono";
import { addProjectSchema } from "../domain/codecs/request-schemas.ts";
import { invalidRequest } from "../domain/validation.ts";
import type { ProjectRegistry } from "../services/project-registry.ts";
import { parseRequestBody } from "./request-body.ts";

export function createProjectRoutes(registry: ProjectRegistry): Hono {
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
        const message = error instanceof Error ? error.message : "Failed to add project";
        return c.json({ error: message }, 400);
      }
    })

    .post("/:id/activate", (c) => {
      try {
        return c.json(registry.activate(c.req.param("id")));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to switch project";
        return c.json({ error: message }, 404);
      }
    })

    .delete("/:id", (c) => {
      try {
        return c.json(registry.unregister(c.req.param("id")));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to remove project";
        return c.json({ error: message }, 400);
      }
    });
}
