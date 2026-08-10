import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { config } from "./config.ts";
import { AutomationConfigStore } from "./services/automation-config-store.ts";
import { DeploymentRunner } from "./services/deployment-runner.ts";
import { ModelRosterService } from "./services/model-roster-service.ts";
import { OrchestrationService } from "./services/orchestration-service.ts";
import { ProjectRegistry } from "./services/project-registry.ts";
import { RunService } from "./services/run/run-service.ts";
import { SettingsStore } from "./services/settings-store.ts";

const registry = new ProjectRegistry();
const settings = new SettingsStore();
const rosters = new ModelRosterService();
const automation = new AutomationConfigStore();
const deployment = new DeploymentRunner();
const runs = new RunService(registry, settings, rosters);
const orchestrations = new OrchestrationService(registry, runs);
runs.registerStageOutputConsumer(orchestrations);
runs.registerOrchestration(orchestrations);

await orchestrations.init();
await runs.init();

serve(
  {
    fetch: createApp({
      runs,
      milestones: runs.milestones,
      orchestrations,
      registry,
      settings,
      rosters,
      automation,
      deployment,
    }).fetch,
    hostname: config.host,
    port: config.port,
  },
  (info) => {
    console.log(`ADHD server listening on http://${config.host}:${info.port}`);
  },
);
