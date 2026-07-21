// Bootstrap: load config, build the app, start listening. Everything else
// lives in routes/ (HTTP surface), services/ (domain logic), engines/ (adapters).
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { RunOrchestrator } from "./services/run-orchestrator.js";

const orchestrator = new RunOrchestrator();

// Restore persisted runs before accepting requests so /api/runs is correct on
// the first request and interrupted runs are reconciled up front.
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
