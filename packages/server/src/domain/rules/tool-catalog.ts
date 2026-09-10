export const TOOL_IDS = ["taskplanner"] as const;

export type ToolId = (typeof TOOL_IDS)[number];

export interface McpLaunchSpec {
  id: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  mutatingTools: string[];
}

export interface ToolEnvironment {
  taskplannerModulePath: string;
  boardWorkspaceRoot: string;
}

const TOOL_LAUNCHERS: Record<ToolId, (environment: ToolEnvironment) => McpLaunchSpec> = {
  taskplanner: ({ taskplannerModulePath, boardWorkspaceRoot }) => ({
    id: "taskplanner",
    command: "node",
    args: [taskplannerModulePath],
    env: { TASKPLANNER_WORKSPACE_ROOT: boardWorkspaceRoot },
    mutatingTools: ["taskplanner_create", "taskplanner_move", "taskplanner_update"],
  }),
};

export function mcpLaunchSpecs(
  tools: readonly ToolId[],
  environment: ToolEnvironment,
): McpLaunchSpec[] {
  return tools.map((tool) => TOOL_LAUNCHERS[tool](environment));
}

export function mcpConfigDocument(servers: readonly McpLaunchSpec[]): string {
  const mcpServers = Object.fromEntries(
    servers.map(({ id, command, args, env }) => [id, { command, args, env }]),
  );
  return `${JSON.stringify({ mcpServers }, null, 2)}\n`;
}

export function deniedToolNames(servers: readonly McpLaunchSpec[]): string[] {
  return servers.flatMap((server) =>
    server.mutatingTools.map((tool) => `mcp__${server.id}__${tool}`),
  );
}
