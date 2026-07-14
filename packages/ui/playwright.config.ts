import path from "node:path";
import { defineConfig } from "@playwright/test";

const HERE = import.meta.dirname;

// Free-tier UI smoke suite — no engine spend, no claude CLI required.
// The live tier (real one-box run) is manual: see docs/e2e-test-plan.md.
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:5173",
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: "pnpm dev",
    cwd: path.resolve(HERE, "../.."),
    // /health is proxied to the API server, so this waits for both processes.
    url: "http://localhost:5173/health",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
