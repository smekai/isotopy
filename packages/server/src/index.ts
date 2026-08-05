import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { config } from "./config.ts";
import { OrchestrationService } from "./services/orchestration.ts";
import { ProjectRegistry } from "./services/project-registry.ts";
import { RunOrchestrator } from "./services/run-orchestrator.ts";
import { SettingsStore } from "./services/settings-store.ts";

const registry = new ProjectRegistry();
const settings = new SettingsStore();
const orchestrator = new RunOrchestrator({ registry, settings });
const orchestrations = new OrchestrationService({ registry, runs: orchestrator });
orchestrator.registerStageOutputConsumer(orchestrations);

await orchestrator.init();
await orchestrations.init();

serve(
  {
    fetch: createApp({ orchestrator, orchestrations, registry, settings }).fetch,
    hostname: config.host,
    port: config.port,
  },
  (info) => {
    console.log(`ADHD server listening on http://${config.host}:${info.port}`);
  },
);
