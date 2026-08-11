import type { AutoReviewSupport, EngineId, EnginePermissionMode } from "@adhd/core";

export const PERMISSION_STRATEGIES = ["unrestricted", "autoReview", "acceptEdits"] as const;

export type PermissionStrategy = (typeof PERMISSION_STRATEGIES)[number];

export interface PermissionPlan {
  strategy: PermissionStrategy;
  notice?: string;
}

const ACCEPT_EDITS_CAVEAT: Partial<Record<EngineId, string>> = {
  cursor: "Cursor has no accept-edits-only headless mode — running with --force",
  codex: "Codex has no accept-edits-only headless mode — running with --sandbox workspace-write",
};

const AUTO_REVIEW_UNSUPPORTED: Record<EngineId, string> = {
  "claude-code":
    "This Claude Code build offers no auto-review permission mode — running unrestricted",
  cursor:
    "Cursor's Auto-review is a CLI config setting rather than a flag, so ADHD cannot ask for it — running unrestricted",
  codex: "This Codex build offers no auto-review approval flag — running unrestricted",
};

const AUTO_REVIEW_UNKNOWN: Record<EngineId, string> = {
  "claude-code": "Could not ask Claude Code whether it supports auto-review — running unrestricted",
  cursor: "Could not ask Cursor whether it supports auto-review — running unrestricted",
  codex: "Could not ask Codex whether it supports auto-review — running unrestricted",
};

function autoReviewPlan(engineId: EngineId, support: AutoReviewSupport): PermissionPlan {
  switch (support) {
    case "available":
      return { strategy: "autoReview" };
    case "unsupported":
      return { strategy: "unrestricted", notice: AUTO_REVIEW_UNSUPPORTED[engineId] };
    case "unknown":
      return { strategy: "unrestricted", notice: AUTO_REVIEW_UNKNOWN[engineId] };
    default: {
      const unreachable: never = support;
      return unreachable;
    }
  }
}

export function permissionPlan(
  engineId: EngineId,
  mode: EnginePermissionMode,
  support: AutoReviewSupport,
): PermissionPlan {
  switch (mode) {
    case "skip":
      return { strategy: "unrestricted" };
    case "acceptEdits":
      return { strategy: "acceptEdits", notice: ACCEPT_EDITS_CAVEAT[engineId] };
    case "autoReview":
      return autoReviewPlan(engineId, support);
    default: {
      const unreachable: never = mode;
      return unreachable;
    }
  }
}
