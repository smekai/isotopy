// Bootstrap: load config, build the app, start listening. Everything else
// lives in routes/ (HTTP surface), services/ (domain logic), engines/ (adapters).
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { config } from "./config.js";

serve(
  {
    fetch: createApp().fetch,
    hostname: config.host,
    port: config.port,
  },
  (info) => {
    console.log(`ADHD server listening on http://${config.host}:${info.port}`);
  },
);
