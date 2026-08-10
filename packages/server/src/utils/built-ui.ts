import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Hono } from "hono";

const UI_DIST_FROM_HERE = ["..", "..", "..", "ui", "dist"];

const ENTRY_FILE = "index.html";

const COMPILED_DIR = "dist";

function hereDir(): string {
  return path.dirname(fileURLToPath(import.meta.url));
}

function runningCompiled(): boolean {
  return path.basename(path.dirname(hereDir())) === COMPILED_DIR;
}

function builtUiRoot(): string | undefined {
  const configured = process.env.ADHD_UI_DIR?.trim();
  if (configured === undefined && !runningCompiled()) {
    return undefined;
  }
  const root = configured ? path.resolve(configured) : path.resolve(hereDir(), ...UI_DIST_FROM_HERE);
  return existsSync(path.join(root, ENTRY_FILE)) ? root : undefined;
}

function uiRootRelativeToCwd(root: string): string | undefined {
  const relative = path.relative(process.cwd(), root);
  if (relative === "" || path.isAbsolute(relative)) {
    return undefined;
  }
  return relative.split(path.sep).join("/");
}

export async function mountBuiltUi(app: Hono): Promise<void> {
  const root = builtUiRoot();
  if (root === undefined) {
    return;
  }
  const relative = uiRootRelativeToCwd(root);
  if (relative === undefined) {
    console.warn(`Built UI at ${root} is not reachable from ${process.cwd()} — start the server from the repository.`);
    return;
  }
  const { serveStatic } = await import("@hono/node-server/serve-static");
  app.use("/*", serveStatic({ root: relative, index: ENTRY_FILE }));
}
