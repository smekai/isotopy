import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import type { EngineId } from "@isotopy/core";
import { mcpPlan } from "../domain/rules/mcp-plan.ts";
import { mcpConfigDocument, mcpLaunchSpecs } from "../domain/rules/tool-catalog.ts";
import type { McpLaunchSpec } from "../domain/rules/tool-catalog.ts";
import { messageOf } from "../utils/message-of.ts";
import type { EngineRunContext } from "./types.ts";

export interface McpSetup {
  servers: McpLaunchSpec[];
  configPath: string;
  release(): Promise<void>;
}

interface CursorBackup {
  present: boolean;
  content?: string;
}

// Cursor takes no MCP flag at all: it reads only `.cursor/mcp.json` beside the code.
const READS_A_PROJECT_CONFIG: Record<EngineId, boolean> = {
  "claude-code": false,
  codex: false,
  cursor: true,
};

const CONFIG_FILE = "mcp.json";

const CURSOR_DIR = ".cursor";

const CURSOR_BACKUP_FILE = "cursor-mcp.backup.json";

const resolveFromServer = createRequire(import.meta.url);

let taskplannerPath: string | undefined;

export async function openMcpSetup(
  engineId: EngineId,
  ctx: EngineRunContext,
): Promise<McpSetup> {
  const configPath = path.join(ctx.mcpTools.runDir, CONFIG_FILE);
  const requested = requestedServers(engineId, ctx);
  const plan = mcpPlan(engineId, requested.servers, process.platform !== "win32");
  for (const notice of [...requested.notices, ...plan.notices]) {
    ctx.onLog({ level: "info", message: notice });
  }
  if (plan.servers.length === 0) {
    return { servers: [], configPath, release: released };
  }
  await writeConfig(configPath, plan.servers);
  return READS_A_PROJECT_CONFIG[engineId]
    ? openProjectConfig(ctx, configPath, plan.servers)
    : { servers: plan.servers, configPath, release: released };
}

function requestedServers(
  engineId: EngineId,
  ctx: EngineRunContext,
): { servers: McpLaunchSpec[]; notices: string[] } {
  if (ctx.mcpTools.tools.length === 0) {
    return { servers: [], notices: [] };
  }
  try {
    return {
      servers: mcpLaunchSpecs(ctx.mcpTools.tools, {
        taskplannerModulePath: taskplannerModulePath(),
        boardWorkspaceRoot: ctx.mcpTools.workspaceRoot,
      }),
      notices: [],
    };
  } catch (error) {
    return {
      servers: [],
      notices: [`This step's tools could not be located, so ${engineId} runs without them: ${messageOf(error)}`],
    };
  }
}

function taskplannerModulePath(): string {
  taskplannerPath ??= resolveFromServer.resolve("@smekai/taskplanner/mcp-server");
  return taskplannerPath;
}

async function writeConfig(configPath: string, servers: McpLaunchSpec[]): Promise<void> {
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, mcpConfigDocument(servers), "utf8");
}

// Keyed to the project, not the run: whoever recovers a killed run's backup has a different id.
async function openProjectConfig(
  ctx: EngineRunContext,
  configPath: string,
  servers: McpLaunchSpec[],
): Promise<McpSetup> {
  const projectConfig = path.join(ctx.cwd, CURSOR_DIR, CONFIG_FILE);
  const backupPath = path.join(ctx.mcpTools.projectDir, CURSOR_BACKUP_FILE);
  await restoreProjectConfig(projectConfig, backupPath);
  const existing = await readText(projectConfig);
  await writeFile(backupPath, backupOf(existing), "utf8");
  await mkdir(path.dirname(projectConfig), { recursive: true });
  await writeFile(projectConfig, mcpConfigDocument(servers), "utf8");
  return {
    servers,
    configPath,
    release: () => restoreProjectConfig(projectConfig, backupPath),
  };
}

async function restoreProjectConfig(projectConfig: string, backupPath: string): Promise<void> {
  const backup = await readBackup(backupPath);
  if (backup === undefined) {
    return;
  }
  if (backup.present && backup.content !== undefined) {
    await writeFile(projectConfig, backup.content, "utf8");
  } else {
    await rm(projectConfig, { force: true });
  }
  await rm(backupPath, { force: true });
}

function backupOf(existing: string | undefined): string {
  const backup: CursorBackup =
    existing === undefined ? { present: false } : { present: true, content: existing };
  return JSON.stringify(backup);
}

async function readBackup(backupPath: string): Promise<CursorBackup | undefined> {
  const raw = await readText(backupPath);
  if (raw === undefined) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return isBackup(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function isBackup(value: unknown): value is CursorBackup {
  return typeof value === "object" && value !== null && "present" in value;
}

function readText(filePath: string): Promise<string | undefined> {
  return readFile(filePath, "utf8").catch(() => undefined);
}

function released(): Promise<void> {
  return Promise.resolve();
}
