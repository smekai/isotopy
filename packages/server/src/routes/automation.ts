import { Hono } from "hono";
import { automationConfigSchema } from "../domain/automation-config.ts";
import { invalidRequest } from "../domain/validation.ts";
import type { ProjectRegistry } from "../services/project-registry.ts";
import { InvalidAutomationConfigError } from "../services/automation-config-store.ts";
import type { AutomationConfigStore } from "../services/automation-config-store.ts";
import { projectScope } from "./project-scope.ts";
import { parseRequestBody } from "./request-body.ts";

function invalidConfig(error: unknown) {
  if (error instanceof InvalidAutomationConfigError) {
    return invalidRequest(error.issues);
  }
  throw error;
}

export function createAutomationRoutes(
  registry: ProjectRegistry,
  automation: AutomationConfigStore,
): Hono {
  return new Hono()
    .get("/", async (c) => {
      try {
        return c.json(await automation.get(projectScope(registry, c)));
      } catch (error) {
        return c.json(invalidConfig(error), 422);
      }
    })
    .put("/", async (c) => {
      const parsed = await parseRequestBody(c.req, automationConfigSchema);
      if (!parsed.ok) {
        return c.json(invalidRequest(parsed.issues), 400);
      }
      try {
        return c.json(await automation.update(projectScope(registry, c), parsed.value));
      } catch (error) {
        return c.json(invalidConfig(error), 400);
      }
    });
}
