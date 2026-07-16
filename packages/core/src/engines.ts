export type EngineId = "claude-code" | "cursor" | "codex";

/** "skip" never blocks on permission prompts (default); "acceptEdits" auto-approves edits only. */
export type EnginePermissionMode = "skip" | "acceptEdits";

export const DEFAULT_PERMISSION_MODE: EnginePermissionMode = "skip";

export interface EngineConnectionDefinition {
  id: string;
  label: string;
  description: string;
  requiresApiKey: boolean;
}

export interface EngineDefinition {
  id: EngineId;
  label: string;
  description: string;
  available: boolean;
  /** How this harness authenticates/bills. Empty when it has no run implementation yet. */
  connections: EngineConnectionDefinition[];
}

export const ENGINES: Record<EngineId, EngineDefinition> = {
  "claude-code": {
    id: "claude-code",
    label: "Claude Code",
    description: "Anthropic's agentic coding CLI",
    available: true,
    connections: [
      {
        id: "subscription",
        label: "Claude subscription",
        description: "Uses your Claude Code CLI login (claude /login). Billed to your Pro/Max plan.",
        requiresApiKey: false,
      },
      {
        id: "api-key",
        label: "Anthropic API key",
        description:
          "Injects a stored ANTHROPIC_API_KEY (CLI runs in bare mode, ignoring your CLI login). Billed to the key.",
        requiresApiKey: true,
      },
    ],
  },
  cursor: {
    id: "cursor",
    label: "Cursor",
    description: "Cursor CLI agent",
    available: false,
    connections: [],
  },
  codex: {
    id: "codex",
    label: "Codex",
    description: "OpenAI Codex CLI",
    available: false,
    connections: [],
  },
};

/** Fallback connection mode when a harness has no stored preference yet. */
export function defaultConnectionMode(engineId: EngineId): string {
  return ENGINES[engineId].connections[0]?.id ?? "subscription";
}

export interface EngineModelOption {
  /** Value passed verbatim to the engine CLI (e.g. `claude --model <id>`). */
  id: string;
  label: string;
  hint: string;
  /** 1M-context variants are gated behind usage credits on subscription plans. */
  requiresUsageCredits?: boolean;
}

export const CLAUDE_MODEL_OPTIONS: EngineModelOption[] = [
  { id: "opus", label: "Opus", hint: "most capable" },
  { id: "sonnet", label: "Sonnet", hint: "balanced (default)" },
  { id: "haiku", label: "Haiku", hint: "fastest" },
  {
    id: "sonnet[1m]",
    label: "Sonnet · 1M context",
    hint: "requires usage credits or API billing",
    requiresUsageCredits: true,
  },
];

export const DEFAULT_CLAUDE_MODEL = "sonnet";

/**
 * Full model IDs previously offered in Setup. They resolve to 1M-context
 * variants in Claude Code, which subscription plans reject — migrate to
 * the standard-context CLI aliases.
 */
export const LEGACY_MODEL_ALIASES: Record<string, string> = {
  "claude-opus-4-8": "opus",
  "claude-sonnet-4-6": "sonnet",
  "claude-haiku-4-5": "haiku",
};

export interface EngineStatus {
  engine: EngineId;
  installed: boolean;
  path?: string;
  version?: string;
  source?: "env" | "path" | "ide-extension";
  message?: string;
}
