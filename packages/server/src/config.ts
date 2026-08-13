import { readFileSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "./paths.ts";

function loadEnvFile(file: string): void {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return;
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

const port = envNumber("ISOTOPY_PORT", envNumber("PORT", 9477));
const uiPort = envNumber("ISOTOPY_UI_PORT", 5173);

export const config = {
  host: process.env.ISOTOPY_HOST ?? "localhost",
  port,
  corsOrigins: process.env.ISOTOPY_CORS_ORIGINS
    ? process.env.ISOTOPY_CORS_ORIGINS.split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)
    : [`http://localhost:${uiPort}`, `http://localhost:${port}`],
  engineTimeoutMs: envNumber("ISOTOPY_ENGINE_TIMEOUT_MS", 600_000),
} as const;
