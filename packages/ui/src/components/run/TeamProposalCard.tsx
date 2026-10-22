import type { CSSProperties } from "react";
import { Users } from "lucide-react";
import type {
  ModelTier,
  ModelTierDefinition,
  OrchestratorRole,
  OrchestratorTeamProposal,
} from "@isotopy/core";
import { MODEL_TIER_OPTIONS, modelTierLabel, resolveTier, resolvedModelLabel } from "@isotopy/core";
import type { RunHarness } from "../../orchestration";
import type { Dir } from "../../theme";
import { FONT, ICON, MONO, RADIUS, SANS, SPACE, WEIGHT } from "../../theme";

const RUN_DEFAULT_TIER = "";
const TIER_SELECT_MAX_WIDTH = 320;

function card(d: Dir): CSSProperties {
  return {
    border: `1px solid ${d.border}`,
    borderRadius: RADIUS.lg,
    background: d.surface2,
    padding: SPACE.xl,
    display: "grid",
    gap: SPACE.md,
  };
}

function cardTitle(d: Dir): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: SPACE.sm,
    color: d.text,
    fontFamily: SANS,
    fontSize: FONT.lg,
    fontWeight: WEIGHT.bold,
  };
}

function mutedText(d: Dir): CSSProperties {
  return { color: d.textMuted, fontFamily: SANS, fontSize: FONT.md, lineHeight: 1.5 };
}

function roleRow(d: Dir): CSSProperties {
  return {
    display: "grid",
    gap: SPACE.xxs,
    borderTop: `1px solid ${d.border}`,
    paddingTop: SPACE.md,
  };
}

function roleName(d: Dir): CSSProperties {
  return { color: d.text, fontFamily: SANS, fontSize: FONT.md, fontWeight: WEIGHT.semibold };
}

function roleSkill(d: Dir): CSSProperties {
  return { color: d.textMuted, fontFamily: MONO, fontSize: FONT.xxs };
}

function tierSelect(d: Dir): CSSProperties {
  return {
    border: `1px solid ${d.border}`,
    borderRadius: RADIUS.md,
    background: d.surface,
    color: d.textMid,
    fontFamily: SANS,
    fontSize: FONT.xs,
    padding: `${SPACE.xxs}px ${SPACE.sm}px`,
    maxWidth: TIER_SELECT_MAX_WIDTH,
  };
}

function approveButton(d: Dir): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: SPACE.sm,
    justifySelf: "start",
    border: `1px solid ${d.accent}`,
    borderRadius: RADIUS.md,
    background: d.accent,
    color: d.accentText,
    padding: `${SPACE.md}px ${SPACE.xl}px`,
    fontFamily: SANS,
    fontSize: FONT.md,
    fontWeight: WEIGHT.semibold,
    cursor: "pointer",
  };
}

function shownTier(
  roleTiers: Record<string, ModelTier | null>,
  role: OrchestratorRole,
): ModelTier | typeof RUN_DEFAULT_TIER {
  const pending = roleTiers[role.id];
  if (pending !== undefined) {
    return pending ?? RUN_DEFAULT_TIER;
  }
  return role.modelTier ?? RUN_DEFAULT_TIER;
}

function tierModel(harness: RunHarness, tier: ModelTier): string {
  return resolvedModelLabel(resolveTier(harness.engine, tier, harness.roster));
}

function runDefaultText(harness: RunHarness): string {
  const label = `Run default (${modelTierLabel(harness.modelTier)})`;
  return harness.pinnedModel === undefined
    ? `${label} — ${tierModel(harness, harness.modelTier)}`
    : label;
}

function tierOptionText(harness: RunHarness, option: ModelTierDefinition): string {
  return harness.pinnedModel === undefined
    ? `${option.label} — ${tierModel(harness, option.id)}`
    : option.label;
}

interface RoleListProps {
  roles: OrchestratorRole[];
  roleTiers: Record<string, ModelTier | null>;
  harness: RunHarness;
  editable: boolean;
  d: Dir;
  onRoleTierChange: (roleId: string, tier: ModelTier | null) => void;
}

function RoleList({ roles, roleTiers, harness, editable, d, onRoleTierChange }: RoleListProps) {
  return (
    <>
      {roles.map((role) => (
        <div key={role.id} style={roleRow(d)}>
          <span style={roleName(d)}>{role.label}</span>
          <span style={roleSkill(d)}>
            {role.skill} · {role.stepTask}
          </span>
          {editable ? (
            <select
              aria-label={`${role.label} model tier`}
              data-testid={`role-tier-${role.id}`}
              value={shownTier(roleTiers, role)}
              onChange={(event) =>
                onRoleTierChange(
                  role.id,
                  event.target.value === RUN_DEFAULT_TIER
                    ? null
                    : (event.target.value as ModelTier),
                )
              }
              style={tierSelect(d)}
            >
              <option value={RUN_DEFAULT_TIER}>{runDefaultText(harness)}</option>
              {MODEL_TIER_OPTIONS.map((option) => (
                <option key={option.id} value={option.id} title={option.hint}>
                  {tierOptionText(harness, option)}
                </option>
              ))}
            </select>
          ) : (
            role.modelTier && <span style={roleSkill(d)}>{modelTierLabel(role.modelTier)}</span>
          )}
          {role.rationale && <span style={mutedText(d)}>{role.rationale}</span>}
        </div>
      ))}
    </>
  );
}

export interface TeamProposalCardProps {
  team: OrchestratorTeamProposal;
  awaitingApproval: boolean;
  busy: boolean;
  harness: RunHarness;
  roleTiers: Record<string, ModelTier | null>;
  d: Dir;
  onApprove: () => void;
  onRoleTierChange: (roleId: string, tier: ModelTier | null) => void;
}

export function TeamProposalCard({
  team,
  awaitingApproval,
  busy,
  harness,
  roleTiers,
  d,
  onApprove,
  onRoleTierChange,
}: TeamProposalCardProps) {
  return (
    <section style={card(d)} data-testid="orchestrator-team">
      <span style={cardTitle(d)}>
        <Users size={ICON.sm} /> {team.name}
      </span>
      <span style={mutedText(d)}>{team.summary}</span>
      {awaitingApproval && harness.pinnedModel !== undefined && (
        <span style={mutedText(d)} data-testid="team-pinned-model">
          Every role runs on {harness.pinnedModel}: it is pinned in Setup, so the presets below
          do not apply.
        </span>
      )}
      <RoleList
        roles={team.roles}
        roleTiers={roleTiers}
        harness={harness}
        editable={awaitingApproval && !busy}
        d={d}
        onRoleTierChange={onRoleTierChange}
      />
      {awaitingApproval && (
        <button
          data-testid="approve-team"
          disabled={busy}
          onClick={onApprove}
          style={approveButton(d)}
        >
          Approve &amp; start
        </button>
      )}
    </section>
  );
}
