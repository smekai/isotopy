import { Hono } from "hono";
import { cors } from "hono/cors";
import { config } from "./config.js";
import { engineRoutes } from "./routes/engines.js";
import { fsRoutes } from "./routes/fs.js";
import { healthRoutes } from "./routes/health.js";
import { createPipelineRoutes } from "./routes/pipelines.js";
import { createProjectRoutes } from "./routes/projects.js";
import { createRunRoutes } from "./routes/runs.js";
import { createSettingsRoutes } from "./routes/settings.js";
import type { ProjectRegistry } from "./services/project-registry.js";
import type { RunOrchestrator } from "./services/run-orchestrator.js";
import type { SettingsStore } from "./services/settings-store.js";

export interface AppDependencies {
  orchestrator: RunOrchestrator;
  registry: ProjectRegistry;
  settings: SettingsStore;
}

export function createApp({ orchestrator, registry, settings }: AppDependencies): Hono {
  const app = new Hono();

  app.use(
    "/*",
    cors({
      origin: config.corsOrigins,
    }),
  );

  app.route("/health", healthRoutes);
  app.route("/projects", createProjectRoutes(registry));
  app.route("/pipelines", createPipelineRoutes(orchestrator));
  app.route("/engines", engineRoutes);
  app.route("/settings", createSettingsRoutes(registry, settings));
  app.route("/runs", createRunRoutes(orchestrator, registry));
  app.route("/fs", fsRoutes);

  return app;
}
