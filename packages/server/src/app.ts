import { Hono } from "hono";
import { cors } from "hono/cors";
import { config } from "./config.ts";
import { createEngineRoutes } from "./routes/engines.ts";
import { fsRoutes } from "./routes/fs.ts";
import { healthRoutes } from "./routes/health.ts";
import { createPipelineRoutes } from "./routes/pipelines.ts";
import { createMilestoneRoutes } from "./routes/milestones.ts";
import { createOrchestrationRoutes } from "./routes/orchestrations.ts";
import { createProjectRoutes } from "./routes/projects.ts";
import { createRunRoutes } from "./routes/runs.ts";
import { createSettingsRoutes } from "./routes/settings.ts";
import type { MilestoneService } from "./services/milestone-service.ts";
import type { ModelRosterService } from "./services/model-roster-service.ts";
import type { OrchestrationService } from "./services/orchestration-service.ts";
import type { ProjectRegistry } from "./services/project-registry.ts";
import type { RunService } from "./services/run/run-service.ts";
import type { SettingsStore } from "./services/settings-store.ts";

export interface AppDependencies {
  runs: RunService;
  milestones: MilestoneService;
  orchestrations: OrchestrationService;
  registry: ProjectRegistry;
  settings: SettingsStore;
  rosters: ModelRosterService;
}

export function createApp({
  runs,
  milestones,
  orchestrations,
  registry,
  settings,
  rosters,
}: AppDependencies): Hono {
  const app = new Hono();

  app.use(
    "/*",
    cors({
      origin: config.corsOrigins,
    }),
  );

  app.route("/health", healthRoutes);
  app.route("/projects", createProjectRoutes(registry));
  app.route("/pipelines", createPipelineRoutes(runs));
  app.route("/milestones", createMilestoneRoutes(milestones, registry));
  app.route("/orchestrations", createOrchestrationRoutes(orchestrations, registry));
  app.route("/engines", createEngineRoutes(rosters));
  app.route("/settings", createSettingsRoutes(registry, settings));
  app.route("/runs", createRunRoutes(runs, registry));
  app.route("/fs", fsRoutes);

  return app;
}
