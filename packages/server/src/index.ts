import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { RunOrchestrator } from "./services/run-orchestrator.js";

const orchestrator = new RunOrchestrator();

await orchestrator.init();

serve(
  {
    fetch: createApp({ orchestrator }).fetch,
    hostname: config.host,
    port: config.port,
  },
  (info) => {
    console.log(`ADHD server listening on http://${config.host}:${info.port}`);
  },
);
