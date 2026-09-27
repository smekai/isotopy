// The repository's own `.mcp.json` needs the root devDependency; `TaskBoardAdapter`
// and the MCP launch spec need it in the server's own dependencies, because a
// filtered install of @isotopy/server is not entitled to a root devDependency.
// Two pins is fine; two *different* pins would mean the board parser a run uses is
// not the one the repository was tested against.
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";
import { REPO_ROOT } from "../../src/paths.ts";

const PACKAGE = "@smekai/taskplanner";

test("the server pins the same TaskPlanner the repository's own board tools use", () => {
  const root = manifest(path.join(REPO_ROOT, "package.json"));
  const server = manifest(path.join(REPO_ROOT, "packages", "server", "package.json"));

  expect(server.dependencies?.[PACKAGE]).toBe(root.devDependencies?.[PACKAGE]);
});

interface Manifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function manifest(file: string): Manifest {
  return JSON.parse(readFileSync(file, "utf8")) as Manifest;
}
