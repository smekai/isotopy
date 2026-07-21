import path from "node:path";
import { defineConfig } from "@playwright/test";

const HERE = import.meta.dirname;

const UI_PORT = process.env.ADHD_UI_PORT ?? "5173";
const BASE_URL = process.env.ADHD_UI_URL ?? `http://localhost:${UI_PORT}`;

// Free + seeded tiers run by default — no engine spend, no claude CLI required.
// The live tier is opt-in behind ADHD_E2E_LIVE=1: see docs/e2e-test-plan.md.
export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  // Every spec drives the same server and the same in-memory run store, so a
  // run started by one file would be visible to another. Serialize.
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: BASE_URL,
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: "pnpm dev",
    cwd: path.resolve(HERE, "../.."),
    // /health is proxied to the API server, so this waits for both processes.
    url: `${BASE_URL}/health`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
