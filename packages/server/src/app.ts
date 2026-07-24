import { Hono } from "hono";
import { cors } from "hono/cors";
import { config } from "./config.ts";
import { engineRoutes } from "./routes/engines.ts";
import { fsRoutes } from "./routes/fs.ts";
import { healthRoutes } from "./routes/health.ts";
import { createPipelineRoutes } from "./routes/pipelines.ts";
import { createProjectRoutes } from "./routes/projects.ts";
import { createRunRoutes } from "./routes/runs.ts";
import { createSettingsRoutes } from "./routes/settings.ts";
import type { ProjectRegistry } from "./services/project-registry.ts";
import type { RunOrchestrator } from "./services/run-orchestrator.ts";
import type { SettingsStore } from "./services/settings-store.ts";

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
