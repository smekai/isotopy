import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { config } from "./config.ts";
import { ProjectRegistry } from "./services/project-registry.ts";
import { RunOrchestrator } from "./services/run-orchestrator.ts";
import { SettingsStore } from "./services/settings-store.ts";

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
