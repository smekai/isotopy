import { Hono } from "hono";
import { cors } from "hono/cors";
import { config } from "./config.ts";
import { createAutomationRoutes } from "./routes/automation.ts";
import { engineRoutes } from "./routes/engines.ts";
import { fsRoutes } from "./routes/fs.ts";
import { healthRoutes } from "./routes/health.ts";
import { createPipelineRoutes } from "./routes/pipelines.ts";
import { createMilestoneRoutes } from "./routes/milestones.ts";
import { createProjectRoutes } from "./routes/projects.ts";
import { createRunRoutes } from "./routes/runs.ts";
import { createSettingsRoutes } from "./routes/settings.ts";
import type { ProjectRegistry } from "./services/project-registry.ts";
import type { AutomationConfigStore } from "./services/automation-config-store.ts";
import type { DeploymentRunner } from "./services/deployment-runner.ts";
import type { RunOrchestrator } from "./services/run-orchestrator.ts";
import type { SettingsStore } from "./services/settings-store.ts";

export interface AppDependencies {
  automation: AutomationConfigStore;
  deployment: DeploymentRunner;
  orchestrator: RunOrchestrator;
  registry: ProjectRegistry;
  settings: SettingsStore;
}

export function createApp({
  automation,
  deployment,
  orchestrator,
  registry,
  settings,
}: AppDependencies): Hono {
  const app = new Hono();

  app.use(
    "/*",
    cors({
      origin: config.corsOrigins,
    }),
  );

  app.route("/health", healthRoutes);
  app.route(
    "/automation",
    createAutomationRoutes(registry, automation, deployment),
  );
  app.route("/projects", createProjectRoutes(registry));
  app.route("/pipelines", createPipelineRoutes(orchestrator));
  app.route("/milestones", createMilestoneRoutes(orchestrator, registry));
  app.route("/engines", engineRoutes);
  app.route("/settings", createSettingsRoutes(registry, settings));
  app.route("/runs", createRunRoutes(orchestrator, registry));
  app.route("/fs", fsRoutes);

  return app;
}
