export const ENGINE_IDS = ["claude-code", "cursor", "codex"] as const;

export type EngineId = (typeof ENGINE_IDS)[number];

export const DEFAULT_ENGINE_ID: EngineId = "claude-code";

export const PERMISSION_MODE_IDS = ["skip", "acceptEdits", "autoReview"] as const;

export type EnginePermissionMode = (typeof PERMISSION_MODE_IDS)[number];

export const DEFAULT_PERMISSION_MODE: EnginePermissionMode = "skip";

export const AUTO_REVIEW_SUPPORT_LEVELS = ["available", "unsupported", "unknown"] as const;

export type AutoReviewSupport = (typeof AUTO_REVIEW_SUPPORT_LEVELS)[number];

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
    id: "autoReview",
    label: "Auto-review",
    description:
      "The CLI's own reviewer decides what is safe to run. Falls back to Never block on a CLI that has no such mode.",
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

export const ENGINE_CAPABILITIES = [
  "resumeSession",
  "reasoningEffort",
  "liveModelListing",
  "tokenUsage",
  "costReporting",
  "autoReviewMode",
  "acceptEditsMode",
] as const;

export type EngineCapability = (typeof ENGINE_CAPABILITIES)[number];

export const CAPABILITY_SUPPORTS = ["supported", "unsupported", "posixOnly", "probed"] as const;

export type CapabilitySupport = (typeof CAPABILITY_SUPPORTS)[number];

export const ENGINE_CAPABILITY_CATALOG: Record<
  EngineId,
  Record<EngineCapability, CapabilitySupport>
> = {
  "claude-code": {
    resumeSession: "supported",
    reasoningEffort: "supported",
    liveModelListing: "unsupported",
    tokenUsage: "supported",
    costReporting: "supported",
    autoReviewMode: "probed",
    acceptEditsMode: "supported",
  },
  cursor: {
    resumeSession: "supported",
    reasoningEffort: "unsupported",
    liveModelListing: "supported",
    tokenUsage: "unsupported",
    costReporting: "unsupported",
    autoReviewMode: "supported",
    acceptEditsMode: "posixOnly",
  },
  codex: {
    resumeSession: "supported",
    reasoningEffort: "supported",
    liveModelListing: "unsupported",
    tokenUsage: "supported",
    costReporting: "unsupported",
    autoReviewMode: "supported",
    acceptEditsMode: "supported",
  },
};

export function engineCapability(
  engineId: EngineId,
  capability: EngineCapability,
): CapabilitySupport {
  return ENGINE_CAPABILITY_CATALOG[engineId][capability];
}

export function capabilityReachable(support: CapabilitySupport, posix: boolean): boolean {
  switch (support) {
    case "supported":
      return true;
    case "posixOnly":
      return posix;
    case "probed":
    case "unsupported":
      return false;
    default: {
      const unreachable: never = support;
      return unreachable;
    }
  }
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

export function defaultConnectionMode(engineId: EngineId): string {
  return ENGINES[engineId].connections[0]?.id ?? "subscription";
}

const MODEL_ORIGINS = ["auto", "live", "config", "static"] as const;

export type EngineModelOrigin = (typeof MODEL_ORIGINS)[number];

export type SelectableModelOrigin = Exclude<EngineModelOrigin, "auto">;

export interface ModelOptionDraft {
  id: string;
  label: string;
  hint: string;
  requiresUsageCredits?: boolean;
}

export interface EngineModelOption extends ModelOptionDraft {
  origin: EngineModelOrigin;
}

export interface StaticModelRoster {
  checkedOn: string;
  options: ModelOptionDraft[];
}

export interface EngineModelRoster {
  options: EngineModelOption[];
  staticCheckedOn: string;
  note?: string;
}

export const AUTO_MODEL_ID = "";

export const AUTO_MODEL_OPTION: EngineModelOption = {
  id: AUTO_MODEL_ID,
  label: "Auto",
  hint: "use the CLI's own configured default",
  origin: "auto",
};

export function isVerifiedModel(option: EngineModelOption): boolean {
  return option.origin !== "static";
}

export function rosterAccepts(roster: EngineModelRoster, modelId: string): boolean {
  return modelId === AUTO_MODEL_ID || roster.options.some((option) => option.id === modelId);
}

export function rosterOrigins(options: EngineModelOption[]): SelectableModelOrigin[] {
  return MODEL_ORIGINS.filter(
    (origin): origin is SelectableModelOrigin =>
      origin !== "auto" && options.some((option) => option.origin === origin),
  );
}

export const MODEL_TIERS = ["auto", "economy", "fast", "balanced", "deep", "max"] as const;

export type ModelTier = (typeof MODEL_TIERS)[number];

export const DEFAULT_MODEL_TIER_BY_ENGINE: Record<EngineId, ModelTier> = {
  "claude-code": "fast",
  cursor: "economy",
  codex: "fast",
};

export function defaultModelTierFor(engineId: EngineId): ModelTier {
  return DEFAULT_MODEL_TIER_BY_ENGINE[engineId];
}

export const DEFAULT_MODEL_TIER: ModelTier = defaultModelTierFor(DEFAULT_ENGINE_ID);

export type EffortLevel = "low" | "medium" | "high" | "xhigh" | "max";

export interface ModelTierDefinition {
  id: ModelTier;
  label: string;
  hint: string;
}

export const MODEL_TIER_OPTIONS: ModelTierDefinition[] = [
  { id: "auto", label: "Auto", hint: "whatever the harness is already set to" },
  {
    id: "economy",
    label: "Economy",
    hint: "the cheapest the harness sells — on Cursor, its subsidised Auto/Composer allowance",
  },
  { id: "fast", label: "Fast", hint: "quick and cheap — routine edits" },
  { id: "balanced", label: "Balanced", hint: "the everyday default" },
  { id: "deep", label: "Deep", hint: "more reasoning — design and hard bugs" },
  { id: "max", label: "Max", hint: "most reasoning, slowest and priciest" },
];

export function modelTierLabel(tier: ModelTier): string {
  return MODEL_TIER_OPTIONS.find((option) => option.id === tier)?.label ?? tier;
}

export interface TierCandidate {
  model: string;
  effort?: EffortLevel;
}

const AUTO_LADDER: TierCandidate[] = [{ model: AUTO_MODEL_ID }];

const TIER_LADDERS: Record<EngineId, Record<ModelTier, TierCandidate[]>> = {
  "claude-code": {
    auto: AUTO_LADDER,
    economy: [{ model: "haiku", effort: "low" }],
    fast: [{ model: "haiku", effort: "medium" }],
    balanced: [{ model: "sonnet", effort: "medium" }],
    deep: [{ model: "opus", effort: "high" }, { model: "sonnet", effort: "high" }],
    max: [{ model: "opus", effort: "xhigh" }, { model: "sonnet", effort: "xhigh" }],
  },
  cursor: {
    auto: AUTO_LADDER,
    economy: [{ model: "auto" }, { model: "composer-2.5" }],
    fast: [{ model: "composer-2.5" }, { model: "auto" }],
    balanced: [{ model: "claude-sonnet-5-thinking-high" }, { model: "composer-2.5" }],
    deep: [
      { model: "claude-opus-5-thinking-high" },
      { model: "claude-sonnet-5-thinking-high" },
    ],
    max: [
      { model: "claude-opus-5-thinking-xhigh" },
      { model: "claude-opus-5-thinking-high" },
    ],
  },
  codex: {
    auto: AUTO_LADDER,
    economy: [{ model: "gpt-5.6-luna", effort: "low" }],
    fast: [{ model: "gpt-5.6-luna", effort: "medium" }],
    balanced: [{ model: "gpt-5.6-sol", effort: "medium" }],
    deep: [{ model: "gpt-5.6-sol", effort: "high" }],
    max: [{ model: "gpt-5.6-sol", effort: "high" }],
  },
};

export function tierLadderFor(engineId: EngineId, tier: ModelTier): TierCandidate[] {
  return TIER_LADDERS[engineId][tier];
}

export interface ResolvedModel {
  model: string;
  effort?: EffortLevel;
  degraded: boolean;
}

export function resolveTier(
  engineId: EngineId,
  tier: ModelTier,
  roster: EngineModelRoster,
): ResolvedModel {
  const offered = new Set(roster.options.map((option) => option.id));
  for (const candidate of tierLadderFor(engineId, tier)) {
    if (candidate.model === AUTO_MODEL_ID || offered.has(candidate.model)) {
      return {
        model: candidate.model,
        effort: candidate.effort,
        degraded: false,
      };
    }
  }
  return { model: AUTO_MODEL_ID, degraded: true };
}

export interface ModelLayers {
  live: ModelOptionDraft[];
  configured?: ModelOptionDraft;
  bundled: StaticModelRoster;
  note?: string;
}

export function mergeModelLayers(layers: ModelLayers): EngineModelRoster {
  const options: EngineModelOption[] = [AUTO_MODEL_OPTION];
  const taken = new Set([AUTO_MODEL_OPTION.id]);
  const layered: [EngineModelOrigin, ModelOptionDraft[]][] = [
    ["live", layers.live],
    ["config", layers.configured === undefined ? [] : [layers.configured]],
    ["static", layers.bundled.options],
  ];
  for (const [origin, drafts] of layered) {
    for (const draft of drafts) {
      if (taken.has(draft.id)) {
        continue;
      }
      taken.add(draft.id);
      options.push({ ...draft, origin });
    }
  }
  return {
    options,
    staticCheckedOn: layers.bundled.checkedOn,
    note: layers.note,
  };
}

const BUNDLED_ROSTERS = new Map<EngineId, EngineModelRoster>();

export function bundledRosterFor(engineId: EngineId): EngineModelRoster {
  const cached = BUNDLED_ROSTERS.get(engineId);
  if (cached !== undefined) {
    return cached;
  }
  const roster = mergeModelLayers({ live: [], bundled: staticModelsFor(engineId) });
  BUNDLED_ROSTERS.set(engineId, roster);
  return roster;
}

const STATIC_ROSTER_CHECKED_ON = "2026-08-23";

export const CLAUDE_STATIC_MODELS: StaticModelRoster = {
  checkedOn: STATIC_ROSTER_CHECKED_ON,
  options: [
    { id: "fable", label: "Fable", hint: "newest frontier alias" },
    { id: "opus", label: "Opus", hint: "most capable" },
    { id: "sonnet", label: "Sonnet", hint: "balanced (default)" },
    { id: "haiku", label: "Haiku", hint: "fastest" },
    {
      id: "sonnet[1m]",
      label: "Sonnet · 1M context",
      hint: "requires usage credits or API billing",
      requiresUsageCredits: true,
    },
  ],
};

export const CURSOR_STATIC_MODELS: StaticModelRoster = {
  checkedOn: STATIC_ROSTER_CHECKED_ON,
  options: [
    { id: "auto", label: "Cursor Auto", hint: "Cursor's own model router" },
    { id: "composer-2.5", label: "Composer 2.5", hint: "Cursor's fast agent model" },
    { id: "gpt-5.3-codex", label: "Codex 5.3", hint: "OpenAI" },
    { id: "gpt-5.2", label: "GPT-5.2", hint: "OpenAI" },
    { id: "gpt-5.6-sol-high", label: "GPT-5.6 Sol 1M High", hint: "OpenAI" },
    { id: "claude-opus-5-thinking-high", label: "Opus 5 1M Thinking", hint: "Anthropic" },
    {
      id: "claude-opus-5-thinking-xhigh",
      label: "Opus 5 1M Extra High Thinking",
      hint: "Anthropic",
    },
    { id: "claude-sonnet-5-thinking-high", label: "Sonnet 5 1M Thinking", hint: "Anthropic" },
    { id: "cursor-grok-4.5-high", label: "Cursor Grok 4.5", hint: "xAI" },
  ],
};

export const CODEX_STATIC_MODELS: StaticModelRoster = {
  checkedOn: STATIC_ROSTER_CHECKED_ON,
  options: [
    { id: "gpt-5.6-sol", label: "GPT-5.6 Sol", hint: "most capable" },
    { id: "gpt-5.6-luna", label: "GPT-5.6 Luna", hint: "faster, cheaper" },
  ],
};

const STATIC_MODELS: Record<EngineId, StaticModelRoster> = {
  "claude-code": CLAUDE_STATIC_MODELS,
  cursor: CURSOR_STATIC_MODELS,
  codex: CODEX_STATIC_MODELS,
};

export function staticModelsFor(engineId: EngineId): StaticModelRoster {
  return STATIC_MODELS[engineId];
}

export const LEGACY_MODEL_ALIASES: Record<EngineId, Record<string, string>> = {
  "claude-code": {
    "claude-opus-4-8": "opus",
    "claude-sonnet-4-6": "sonnet",
    "claude-haiku-4-5": "haiku",
  },
  cursor: {
    "composer-1": AUTO_MODEL_ID,
    "sonnet-4.5": AUTO_MODEL_ID,
    "gpt-5": AUTO_MODEL_ID,
  },
  codex: {
    "gpt-5-codex": AUTO_MODEL_ID,
    "o4-mini": AUTO_MODEL_ID,
    "gpt-5": AUTO_MODEL_ID,
    "gpt-5-mini": AUTO_MODEL_ID,
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
