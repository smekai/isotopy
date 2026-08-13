import os from "node:os";
import path from "node:path";
import { defineConfig } from "@playwright/test";

const HERE = import.meta.dirname;

// Preferences are durable server state (TASK-065), so the suite gets its own
// `~/.adhd` and its own ports: it must never edit the developer's real settings,
// and it must not collide with a `pnpm dev` already on 5173.
const E2E_HOME = path.join(os.tmpdir(), "adhd-e2e");
const SERVER_PORT = process.env.ISOTOPY_PORT ?? "9499";
const UI_PORT = process.env.ISOTOPY_UI_PORT ?? "5199";

// Built tier (ISOTOPY_E2E_BUILT=1) drives the compiled artifact instead of the dev
// stack — `vite preview` over `dist` in place of the dev server, same ports and
// same proxy. It rebuilds first so a stale `dist` cannot pass for the source.
const BUILT = process.env.ISOTOPY_E2E_BUILT === "1";
const BASE_URL = process.env.ISOTOPY_UI_URL ?? `http://localhost:${UI_PORT}`;

// Free + seeded tiers run by default — no engine spend, no claude CLI required.
// The live tier is opt-in behind ISOTOPY_E2E_LIVE=1: see docs/e2e-test-plan.md.
export default defineConfig({
  testDir: "./e2e",
  // `.e2e.ts`, not `.spec.ts`: a spec in this repo is a Vitest unit spec over a
  // pure function, and one extension meaning two things is how a browser test
  // ends up being read as one.
  testMatch: "**/*.e2e.ts",
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
    command: BUILT ? "pnpm build && pnpm start" : "pnpm dev",
    cwd: path.resolve(HERE, "../.."),
    // /health is proxied to the API server, so this waits for both processes.
    url: `${BASE_URL}/health`,
    env: {
      ISOTOPY_USER_HOME: path.join(E2E_HOME, "user"),
      ISOTOPY_HOME: path.join(E2E_HOME, "home"),
      ISOTOPY_PORT: SERVER_PORT,
      ISOTOPY_UI_PORT: UI_PORT,
    },
    // The isolation above is only real on a server this config started.
    reuseExistingServer: false,
    timeout: BUILT ? 240_000 : 120_000,
  },
});
