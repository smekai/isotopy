import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import {
  automationConfigSchema,
  productionDeploymentRequestSchema,
} from "../schemas/automation-file.ts";
import { invalidRequest } from "../domain/validation.ts";
import { InvalidAutomationConfigError } from "../services/automation-config-store.ts";
import type { AutomationConfigStore } from "../services/automation-config-store.ts";
import type { DeploymentRunner } from "../services/deployment-runner.ts";
import { ProductNotConfiguredError } from "../services/product-process-service.ts";
import type { ProductProcessService } from "../services/product-process-service.ts";
import { persistProjectDeploymentArtifacts } from "../services/run-evidence.ts";
import type { ProjectRegistry } from "../services/project-registry.ts";
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
  deployment: DeploymentRunner,
  product: ProductProcessService,
): Hono {
  return new Hono()
    .get("/product", async (c) => {
      try {
        return c.json(await product.status(projectScope(registry, c)));
      } catch (error) {
        return c.json(invalidConfig(error), 422);
      }
    })

    .post("/product/start", async (c) => {
      const project = projectScope(registry, c);
      try {
        return c.json(await product.start(project));
      } catch (error) {
        if (error instanceof ProductNotConfiguredError) {
          return c.json({ error: error.message }, 409);
        }
        return c.json(invalidConfig(error), 422);
      }
    })

    .post("/product/stop", async (c) => {
      const project = projectScope(registry, c);
      await product.stop();
      return c.json(await product.status(project));
    })

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
    })

    .post("/deploy/production", async (c) => {
      const parsed = await parseRequestBody(c.req, productionDeploymentRequestSchema);
      if (!parsed.ok) {
        return c.json(invalidRequest(parsed.issues), 400);
      }
      const project = projectScope(registry, c);
      let target;
      try {
        target = (await automation.get(project)).production;
      } catch (error) {
        return c.json(invalidConfig(error), 422);
      }
      if (target === undefined) {
        return c.json({ error: "No production deployment target is configured" }, 409);
      }

      const id = randomUUID();
      const logLines: string[] = [];
      const result = await deployment.run({
        project,
        environment: "production",
        target,
        signal: c.req.raw.signal,
        onLine: (stream, line) => logLines.push(`[${stream}] ${line}`),
      });
      await persistProjectDeploymentArtifacts(project, id, result, logLines);
      return c.json({ id, result }, result.verdict === "pass" ? 200 : 502);
    });
}
