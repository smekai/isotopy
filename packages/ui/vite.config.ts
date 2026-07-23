import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "../..");

// API prefixes proxied to the server during development.
// Keep in sync with the route mounts in packages/server/src/app.ts.
const API_PROXY_PATHS = [
  "/pipelines",
  "/projects",
  "/runs",
  "/health",
  "/settings",
  "/engines",
  "/fs",
];

export default defineConfig(({ mode }) => {
  // Read the shared .env at the repo root so UI and server agree on ports.
  const env = loadEnv(mode, REPO_ROOT, "");
  const serverPort = env.ADHD_PORT ?? env.PORT ?? "9477";
  const serverUrl = env.ADHD_SERVER_URL ?? `http://localhost:${serverPort}`;
  const uiPort = Number(env.ADHD_UI_PORT ?? 5173);

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@adhd/core": path.resolve(__dirname, "../core/src/index.ts"),
      },
    },
    server: {
      port: uiPort,
      proxy: Object.fromEntries(API_PROXY_PATHS.map((prefix) => [prefix, serverUrl])),
    },
  };
});
