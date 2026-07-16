import { readFileSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "./paths.js";

/**
 * Minimal .env loader (KEY=VALUE lines, # comments, optional quotes).
 * Values already present in the process environment win — the file only
 * fills gaps, so `PORT=1234 pnpm dev` still overrides .env.
 */
function loadEnvFile(file: string): void {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return; // no .env file — process env and defaults apply
  }
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`Environment variable ${name} must be a number, got "${raw}"`);
  }
  return value;
}

loadEnvFile(path.join(REPO_ROOT, ".env"));

const port = envNumber("ADHD_PORT", envNumber("PORT", 9477));
const uiPort = envNumber("ADHD_UI_PORT", 5173);

/** Server configuration — every value can be set via the environment or a root .env file. */
export const config = {
  /** Interface the HTTP server binds to; set ADHD_HOST=0.0.0.0 to expose beyond this machine. */
  host: process.env.ADHD_HOST ?? "localhost",
  port,
  /** Origins allowed by CORS; defaults cover the Vite dev UI and the server itself. */
  corsOrigins: process.env.ADHD_CORS_ORIGINS
    ? process.env.ADHD_CORS_ORIGINS.split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)
    : [`http://localhost:${uiPort}`, `http://localhost:${port}`],
  /** Hard cap for a single engine (CLI) run. */
  engineTimeoutMs: envNumber("ADHD_ENGINE_TIMEOUT_MS", 600_000),
} as const;
