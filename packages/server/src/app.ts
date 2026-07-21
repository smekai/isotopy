import { Hono } from "hono";
import { cors } from "hono/cors";
import { config } from "./config.js";
import { engineRoutes } from "./routes/engines.js";
import { fsRoutes } from "./routes/fs.js";
import { healthRoutes } from "./routes/health.js";
import { createPipelineRoutes } from "./routes/pipelines.js";
import { createRunRoutes } from "./routes/runs.js";
import { settingsRoutes } from "./routes/settings.js";
import type { RunOrchestrator } from "./services/run-orchestrator.js";

/** Services the HTTP layer is built on. Passed in so tests can substitute them. */
export interface AppDependencies {
  orchestrator: RunOrchestrator;
}

/** Wires middleware and route controllers into the HTTP app. */
export function createApp({ orchestrator }: AppDependencies): Hono {
  const app = new Hono();

  app.use(
    "/*",
    cors({
      origin: config.corsOrigins,
    }),
  );

  app.route("/health", healthRoutes);
  app.route("/pipelines", createPipelineRoutes(orchestrator));
  app.route("/engines", engineRoutes);
  app.route("/settings", settingsRoutes);
  app.route("/runs", createRunRoutes(orchestrator));
  app.route("/fs", fsRoutes);

  return app;
}
