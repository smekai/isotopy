import { Hono } from "hono";
import { cors } from "hono/cors";
import { config } from "./config.js";
import { engineRoutes } from "./routes/engines.js";
import { healthRoutes } from "./routes/health.js";
import { pipelineRoutes } from "./routes/pipelines.js";
import { runRoutes } from "./routes/runs.js";
import { settingsRoutes } from "./routes/settings.js";

/** Wires middleware and route controllers into the HTTP app. */
export function createApp(): Hono {
  const app = new Hono();

  app.use(
    "/*",
    cors({
      origin: config.corsOrigins,
    }),
  );

  app.route("/health", healthRoutes);
  app.route("/pipelines", pipelineRoutes);
  app.route("/engines", engineRoutes);
  app.route("/settings", settingsRoutes);
  app.route("/runs", runRoutes);

  return app;
}
