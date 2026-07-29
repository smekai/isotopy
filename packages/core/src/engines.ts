export type EngineId = "claude-code" | "cursor" | "codex";

export const DEFAULT_ENGINE_ID: EngineId = "claude-code";

export type EnginePermissionMode = "skip" | "acceptEdits";

export const DEFAULT_PERMISSION_MODE: EnginePermissionMode = "skip";

export interface EnginePermissionModeDefinition {
  id: EnginePermissionMode;
  label: string;
  description: string;
  recommended?: boolean;
}

export const PERMISSION_MODES: EnginePermissionModeDefinition[] = [
  {
    id: "skip",
    label: "Never block",
    description: "The engine runs fully autonomously — no permission prompts.",
    recommended: true,
  },
  {
    id: "acceptEdits",
    label: "Accept edits only",
    description: "File edits auto-approved; shell commands may stall the run.",
  },
];

export function permissionModeLabel(mode: EnginePermissionMode): string {
  return PERMISSION_MODES.find((option) => option.id === mode)?.label ?? mode;
}

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
  /** The CLI can resume a session, so an agent on it may stop and ask a question. */
  conversational: boolean;
  connections: EngineConnectionDefinition[];
}

export function isConversational(engineId: EngineId): boolean {
  return ENGINES[engineId].conversational;
}

export const ENGINES: Record<EngineId, EngineDefinition> = {
  "claude-code": {
    id: "claude-code",
    label: "Claude Code",
    description: "Anthropic's agentic coding CLI",
    available: true,
    conversational: true,
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
    available: true,
    conversational: false,
    connections: [
      {
        id: "subscription",
        label: "Cursor subscription",
        description:
          "Uses your Cursor CLI login (run `agent login` once in a terminal). Billed to your Cursor plan.",
        requiresApiKey: false,
      },
      {
        id: "api-key",
        label: "Cursor API key",
        description:
          "Injects a stored CURSOR_API_KEY for the run, overriding the CLI login. Usage-based billing.",
        requiresApiKey: true,
      },
    ],
  },
  codex: {
    id: "codex",
    label: "Codex",
    description: "OpenAI Codex CLI",
    available: true,
    conversational: true,
    connections: [
      {
        id: "subscription",
        label: "ChatGPT subscription",
        description:
          "Uses your Codex CLI login (run `codex login` once in a terminal). Billed to your ChatGPT Plus/Pro plan.",
        requiresApiKey: false,
      },
      {
        id: "api-key",
        label: "OpenAI API key",
        description:
          "Injects a stored OPENAI_API_KEY for the run, overriding the CLI login. Usage-based billing.",
        requiresApiKey: true,
      },
    ],
  },
};

export function defaultConnectionMode(engineId: EngineId): string {
  return ENGINES[engineId].connections[0]?.id ?? "subscription";
}

export interface EngineModelOption {
  id: string;
  label: string;
  hint: string;
  requiresUsageCredits?: boolean;
}

export const AUTO_MODEL_ID = "";

export const AUTO_MODEL_OPTION: EngineModelOption = {
  id: AUTO_MODEL_ID,
  label: "Auto",
  hint: "use the CLI's own configured default",
};

export type EngineModelSource = "cli" | "config" | "static";

export interface EngineModelList {
  options: EngineModelOption[];
  source: EngineModelSource;
  note?: string;
}

export const CLAUDE_MODEL_OPTIONS: EngineModelOption[] = [
  AUTO_MODEL_OPTION,
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

export const CURSOR_MODEL_OPTIONS: EngineModelOption[] = [
  AUTO_MODEL_OPTION,
  { id: "auto", label: "Cursor Auto", hint: "Cursor's own model router" },
  { id: "composer-1", label: "Composer 1", hint: "Cursor's fast agent model" },
  { id: "sonnet-4.5", label: "Claude Sonnet 4.5", hint: "Anthropic" },
  { id: "gpt-5", label: "GPT-5", hint: "OpenAI" },
];

export const DEFAULT_CURSOR_MODEL = AUTO_MODEL_ID;

export const CODEX_MODEL_OPTIONS: EngineModelOption[] = [
  AUTO_MODEL_OPTION,
  { id: "gpt-5", label: "GPT-5", hint: "OpenAI flagship" },
  { id: "gpt-5-mini", label: "GPT-5 Mini", hint: "faster, cheaper" },
];

export const DEFAULT_CODEX_MODEL = AUTO_MODEL_ID;

const MODEL_OPTIONS: Record<EngineId, EngineModelOption[]> = {
  "claude-code": CLAUDE_MODEL_OPTIONS,
  cursor: CURSOR_MODEL_OPTIONS,
  codex: CODEX_MODEL_OPTIONS,
};

export function modelOptionsFor(engineId: EngineId): EngineModelOption[] {
  return MODEL_OPTIONS[engineId];
}

const DEFAULT_MODELS: Record<EngineId, string> = {
  "claude-code": DEFAULT_CLAUDE_MODEL,
  cursor: DEFAULT_CURSOR_MODEL,
  codex: DEFAULT_CODEX_MODEL,
};

export function defaultModelFor(engineId: EngineId): string {
  return DEFAULT_MODELS[engineId];
}

export const LEGACY_MODEL_ALIASES: Record<EngineId, Record<string, string>> = {
  "claude-code": {
    "claude-opus-4-8": "opus",
    "claude-sonnet-4-6": "sonnet",
    "claude-haiku-4-5": "haiku",
  },
  cursor: {},
  codex: {
    "gpt-5-codex": AUTO_MODEL_ID,
    "o4-mini": AUTO_MODEL_ID,
  },
};

export interface EngineStatus {
  engine: EngineId;
  installed: boolean;
  path?: string;
  version?: string;
  source?: "env" | "path" | "ide-extension" | "install-dir";
  message?: string;
  loggedIn?: boolean;
  installCommand?: string;
  docsUrl?: string;
}
