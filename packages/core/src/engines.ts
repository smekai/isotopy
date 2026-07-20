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
    available: true,
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

/**
 * "let the CLI decide" — no `--model` flag is passed, so the engine's own
 * configured default wins (e.g. `model = "…"` in `~/.codex/config.toml`).
 * Always safer than a snapshot ID our roster may have outlived.
 */
export const AUTO_MODEL_ID = "";

export const AUTO_MODEL_OPTION: EngineModelOption = {
  id: AUTO_MODEL_ID,
  label: "Auto",
  hint: "use the CLI's own configured default",
};

/** Where a model roster came from — surfaced in Setup so a stale list is visible. */
export type EngineModelSource = "cli" | "config" | "static";

export interface EngineModelList {
  options: EngineModelOption[];
  source: EngineModelSource;
  /** Why the source is what it is (probe failure, config path, …). */
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

/**
 * Cursor's model roster churns fast — the named entries are a snapshot; `auto`
 * always works. True up against `agent models` when they drift.
 */
export const CURSOR_MODEL_OPTIONS: EngineModelOption[] = [
  AUTO_MODEL_OPTION,
  { id: "auto", label: "Cursor Auto", hint: "Cursor's own model router" },
  { id: "composer-1", label: "Composer 1", hint: "Cursor's fast agent model" },
  { id: "sonnet-4.5", label: "Claude Sonnet 4.5", hint: "Anthropic" },
  { id: "gpt-5", label: "GPT-5", hint: "OpenAI" },
];

export const DEFAULT_CURSOR_MODEL = AUTO_MODEL_ID;

/**
 * The Codex CLI has no `models` subcommand to query, and model availability
 * differs between ChatGPT-subscription and API-key auth — so any named entry
 * here is a guess that can 400 at run time. Auto (no `--model`) is the default;
 * the adapter's listModels() adds whatever `~/.codex/config.toml` actually sets.
 */
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

/** Model choices for the Setup picker. Empty for engines without a run implementation. */
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

/**
 * Model IDs previously offered in Setup that are now known-bad, mapped to a
 * working replacement. Stored preferences are migrated through this on read so
 * a user who picked a since-retired model isn't stuck with failing runs.
 *
 * - Claude: full IDs resolve to 1M-context variants, which subscription plans reject.
 * - Codex: `gpt-5-codex` is rejected outright on ChatGPT-account auth — fall back
 *   to Auto so the CLI's own configured default wins.
 */
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
  /** Whether the CLI has valid auth. `undefined` when auth state can't be determined. */
  loggedIn?: boolean;
  /** Shell command that installs the CLI — powers the Setup "copy install command" button. */
  installCommand?: string;
  /** Docs link for manual install/setup. */
  docsUrl?: string;
}
