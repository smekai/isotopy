import path from "node:path";
import { defineConfig } from "vitest/config";

const HERE = import.meta.dirname;

// Component tests and unit specs. The Playwright suite is a separate runner
// (`pnpm e2e`) — see docs/testing.md for which layer a check belongs in.
export default defineConfig({
  resolve: {
    alias: {
      // @adhd/core is consumed as TypeScript source; mirror packages/ui/vite.config.ts.
      "@adhd/core": path.resolve(HERE, "packages/core/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    // Tests live in each package's test/ directory, never beside the source —
    // src/ is what ships, and a colocated spec lands in dist/.
    //   *.comp.ts — component tests: request in → behaviour out, deps mocked
    //   *.spec.ts — unit specs: complicated pure functions
    // Playwright keeps its own directory (packages/ui/e2e) and its own runner,
    // so its *.spec.ts files are never matched here.
    include: ["packages/*/test/**/*.{comp,spec}.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
