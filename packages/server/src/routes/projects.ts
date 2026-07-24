import { Hono } from "hono";
import type { ProjectRegistry } from "../services/project-registry.ts";

interface AddProjectBody {
  root?: string;
}

export function createProjectRoutes(registry: ProjectRegistry): Hono {
  return new Hono()
    .get("/", (c) => c.json(registry.list()))

    .post("/", async (c) => {
      const body = await c.req
        .json<AddProjectBody>()
        .catch(() => ({}) as AddProjectBody);
      try {
        const project = await registry.add(body.root ?? "");
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
