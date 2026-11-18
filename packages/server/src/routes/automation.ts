import { Hono } from "hono";
import {
  automationConfigSchema,
  productionDeploymentRequestSchema,
  productionRollbackRequestSchema,
} from "../schemas/automation-file.ts";
import { invalidRequest } from "../domain/validation.ts";
import { InvalidAutomationConfigError } from "../services/automation-config-store.ts";
import type { AutomationConfigStore } from "../services/automation-config-store.ts";
import { ProductNotConfiguredError } from "../services/product-process-service.ts";
import type { ProductProcessService } from "../services/product-process-service.ts";
import {
  NoProductionTargetError,
  RollbackUnavailableError,
} from "../services/production-releases.ts";
import type { ProductionReleases } from "../services/production-releases.ts";
import type { ProjectRegistry } from "../services/project-registry.ts";
import { projectScope } from "./project-scope.ts";
import { parseRequestBody } from "./request-body.ts";

function invalidConfig(error: unknown) {
  if (error instanceof InvalidAutomationConfigError) {
    return invalidRequest(error.issues);
  }
  throw error;
}

function productionRefusal(error: unknown) {
  if (error instanceof NoProductionTargetError || error instanceof RollbackUnavailableError) {
    return { status: 409 as const, body: { error: error.message } };
  }
  return { status: 422 as const, body: invalidConfig(error) };
}

export function createAutomationRoutes(
  registry: ProjectRegistry,
  automation: AutomationConfigStore,
  production: ProductionReleases,
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

    .get("/production", async (c) => {
      try {
        return c.json(await production.status(projectScope(registry, c)));
      } catch (error) {
        return c.json(invalidConfig(error), 422);
      }
    })

    .post("/deploy/production", async (c) => {
      const parsed = await parseRequestBody(c.req, productionDeploymentRequestSchema);
      if (!parsed.ok) {
        return c.json(invalidRequest(parsed.issues), 400);
      }
      try {
        const record = await production.deploy(projectScope(registry, c), c.req.raw.signal);
        return c.json(record, record.result.verdict === "pass" ? 200 : 502);
      } catch (error) {
        const refusal = productionRefusal(error);
        return c.json(refusal.body, refusal.status);
      }
    })

    .post("/rollback/production", async (c) => {
      const parsed = await parseRequestBody(c.req, productionRollbackRequestSchema);
      if (!parsed.ok) {
        return c.json(invalidRequest(parsed.issues), 400);
      }
      try {
        const record = await production.rollback(
          projectScope(registry, c),
          parsed.value.ref,
          c.req.raw.signal,
        );
        return c.json(record, record.result.verdict === "pass" ? 200 : 502);
      } catch (error) {
        const refusal = productionRefusal(error);
        return c.json(refusal.body, refusal.status);
      }
    });
}
