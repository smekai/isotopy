import { ENGINES, capabilityReachable, engineCapability } from "@isotopy/core";
import type { EngineId } from "@isotopy/core";
import type { McpLaunchSpec } from "./tool-catalog.ts";

export interface McpPlan {
  servers: McpLaunchSpec[];
  notices: string[];
}

export function mcpPlan(
  engineId: EngineId,
  servers: McpLaunchSpec[],
  posix: boolean,
): McpPlan {
  if (servers.length === 0) {
    return { servers: [], notices: [] };
  }
  const label = ENGINES[engineId].label;
  if (!capabilityReachable(engineCapability(engineId, "mcpServers"), posix)) {
    return {
      servers: [],
      notices: [`${label} cannot carry a tool here, so this step runs without ${toolList(servers)}`],
    };
  }
  return { servers, notices: denialNotices(engineId, servers, label, posix) };
}

function denialNotices(
  engineId: EngineId,
  servers: McpLaunchSpec[],
  label: string,
  posix: boolean,
): string[] {
  const mutating = servers.filter((server) => server.mutatingTools.length > 0);
  if (mutating.length === 0) {
    return [];
  }
  return capabilityReachable(engineCapability(engineId, "deniedTools"), posix)
    ? []
    : [
        `${label} cannot deny individual tools, so ${toolList(mutating)} is available to write with, not only to read`,
      ];
}

function toolList(servers: McpLaunchSpec[]): string {
  return servers.map((server) => server.id).join(", ");
}
