import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { config } from "./config.ts";
import { ProjectDatabases } from "./db/project-databases.ts";
import { AutomationConfigStore } from "./services/automation-config-store.ts";
import { DeploymentRunner } from "./services/deployment-runner.ts";
import { ModelRosterService } from "./services/model-roster-service.ts";
import { OrchestrationService } from "./services/orchestration-service.ts";
import { ProductProcessService } from "./services/product-process-service.ts";
import { ProjectRegistry } from "./services/project-registry.ts";
import { RunService } from "./services/run/run-service.ts";
import { ScheduleService } from "./services/schedule-service.ts";
import { SettingsStore } from "./services/settings-store.ts";
import { serverLogPath } from "./paths.ts";
import { PinoLogger } from "./utils/pino-logger.ts";

const logger = PinoLogger.toConsoleAndFile(serverLogPath());
const registry = new ProjectRegistry(logger);
const settings = new SettingsStore(logger);
const rosters = new ModelRosterService(logger);
const automation = new AutomationConfigStore();
const deployment = new DeploymentRunner();
const databases = new ProjectDatabases(logger);
const product = new ProductProcessService(automation, logger);
const runs = new RunService(
  registry,
  settings,
  rosters,
  automation,
  deployment,
  databases,
  logger,
  product,
);
const orchestrations = new OrchestrationService(registry, runs, settings, databases, logger);
const schedules = new ScheduleService(
  registry,
  runs,
  orchestrations,
  databases,
  settings,
  logger,
);
runs.registerOrchestration(orchestrations);

await orchestrations.init();
await runs.init();
await schedules.init();
schedules.start();

serve(
  {
    fetch: createApp({
      runs,
      milestones: runs.milestones,
      orchestrations,
      schedules,
      registry,
      settings,
      rosters,
      automation,
      deployment,
      product,
      logger,
    }).fetch,
    hostname: config.host,
    port: config.port,
  },
  (info) => {
    const address = info.family === "IPv6" ? `[${info.address}]` : info.address;
    logger.info(`Isotopy server listening on http://${address}:${info.port}`);
  },
);

let stopping = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (stopping) {
    return;
  }
  stopping = true;
  logger.info(`Isotopy server stopping on ${signal}`);
  schedules.stop();
  await product.shutdown();
  await runs.shutdown();
  await databases.settleAll();
  process.exit(0);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void shutdown(signal);
  });
}
