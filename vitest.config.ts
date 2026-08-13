import path from "node:path";
import { defineConfig } from "vitest/config";

const HERE = import.meta.dirname;

// @isotopy/core is consumed as TypeScript source; mirror packages/ui/vite.config.ts.
const RESOLVE = {
  alias: {
    "@isotopy/core": path.resolve(HERE, "packages/core/src/index.ts"),
  },
};

const EXCLUDE = ["**/node_modules/**", "**/dist/**"];
const NODE_TEST_TIMEOUT_MS = 15_000;

// Component tests and unit specs. The Playwright suite is a separate runner
// (`pnpm e2e`) — see docs/testing.md for which layer a check belongs in.
//
// Tests live in each package's test/ directory, never beside the source —
// src/ is what ships, and a colocated spec lands in dist/.
//   *.comp.ts  — component tests: request in → behaviour out, deps mocked
//   *.comp.tsx — the same, for code that needs to render (React hooks and
//                components); jsdom rather than node, hence its own project
//   *.spec.ts  — unit specs: complicated pure functions
// Playwright keeps its own directory (packages/ui/e2e) and its own runner,
// so its *.spec.ts files are never matched here.
export default defineConfig({
  test: {
    projects: [
      {
        resolve: RESOLVE,
        test: {
          name: "node",
          environment: "node",
          testTimeout: NODE_TEST_TIMEOUT_MS,
          include: ["packages/*/test/**/*.{comp,spec}.ts"],
          exclude: EXCLUDE,
        },
      },
      {
        resolve: RESOLVE,
        test: {
          name: "ui",
          environment: "jsdom",
          include: ["packages/ui/test/**/*.comp.tsx"],
          exclude: EXCLUDE,
        },
      },
    ],
  },
});
