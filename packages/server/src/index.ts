import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { ProjectRegistry } from "./services/project-registry.js";
import { RunOrchestrator } from "./services/run-orchestrator.js";
import { SettingsStore } from "./services/settings-store.js";

const registry = new ProjectRegistry();
const settings = new SettingsStore();
const orchestrator = new RunOrchestrator({ registry, settings });

await orchestrator.init();

serve(
  {
    fetch: createApp({ orchestrator, registry, settings }).fetch,
    hostname: config.host,
    port: config.port,
  },
  (info) => {
    console.log(`ADHD server listening on http://${config.host}:${info.port}`);
  },
);
