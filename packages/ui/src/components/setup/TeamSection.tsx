import type { CSSProperties } from "react";
import type { ProjectTeam, TeamDefinition, TeamFlowStep, TeamRole } from "@isotopy/core";
import { FONT, MONO, RADIUS, SANS, SPACE, WEIGHT } from "../../theme";
import type { Dir } from "../../theme";
import {
  ERROR_RED,
  OPTION_STACK,
  accentBadge,
  mutedCaption,
  optionLabel,
  sectionSubtitle,
  sectionTitle,
} from "./setup-styles";

const TEAM_FILE_PATH = ".isotopy/team.md";

const SECTION_GAP: CSSProperties = { height: SPACE.xxl };

const CARD_HEADER: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: SPACE.md,
  marginBottom: SPACE.xs,
};

const ISSUE_LINE: CSSProperties = {
  color: ERROR_RED,
  fontFamily: SANS,
  fontSize: FONT.sm,
  marginBottom: SPACE.sm,
};

function entryCard(d: Dir): CSSProperties {
  return {
    padding: `${SPACE.lg}px ${SPACE.xl}px`,
    border: `1px solid ${d.border}`,
    borderRadius: RADIUS.xl,
  };
}

function idLabel(d: Dir): CSSProperties {
  return { color: d.textMuted, fontFamily: MONO, fontSize: FONT.xs, fontWeight: WEIGHT.medium };
}

function stepList(d: Dir): CSSProperties {
  return { margin: 0, paddingLeft: SPACE.xl, color: d.textMid, fontFamily: MONO, fontSize: FONT.xs };
}

function sourceNote(team: ProjectTeam): string {
  return team.source === "template"
    ? `No ${TEAM_FILE_PATH} yet: this is the bundled template, written and committed the first time a team runs.`
    : `Edit ${TEAM_FILE_PATH} in your editor; the Orchestrator can only propose a change for you to approve.`;
}

export interface TeamSectionProps {
  d: Dir;
  team?: ProjectTeam;
}

export function TeamSection({ d, team }: TeamSectionProps) {
  return (
    <div>
      <div style={sectionTitle(d)}>Team</div>
      <div style={sectionSubtitle(d)}>
        The project&apos;s one standing team. Every run is one of its flows, and starts without
        asking you.
      </div>
      {team && <div style={mutedCaption(d)}>{sourceNote(team)}</div>}
      <div style={SECTION_GAP} />
      {team?.state === "invalid" &&
        team.issues.map((issue) => (
          <div key={issue} data-testid="team-issue" style={ISSUE_LINE}>
            {issue}
          </div>
        ))}
      {team?.state === "valid" && <TeamDetail d={d} team={team.team} />}
    </div>
  );
}

interface TeamDetailProps {
  d: Dir;
  team: TeamDefinition;
}

function TeamDetail({ d, team }: TeamDetailProps) {
  return (
    <>
      <div style={sectionTitle(d)}>Roster</div>
      <div style={OPTION_STACK}>
        {team.roster.map((role) => (
          <RoleCard key={role.id} d={d} role={role} />
        ))}
      </div>
      <div style={SECTION_GAP} />
      <div style={sectionTitle(d)}>Flows</div>
      <div style={OPTION_STACK}>
        {Object.entries(team.flows).map(([name, steps]) => (
          <FlowCard key={name} d={d} name={name} steps={steps} />
        ))}
      </div>
    </>
  );
}

interface RoleCardProps {
  d: Dir;
  role: TeamRole;
}

function RoleCard({ d, role }: RoleCardProps) {
  return (
    <div data-testid={`team-role-${role.id}`} style={entryCard(d)}>
      <div style={CARD_HEADER}>
        <div style={optionLabel(d)}>{role.label}</div>
        <div style={idLabel(d)}>{role.agent}</div>
        {role.engine === "secondary" && <div style={accentBadge(d)}>SECONDARY ENGINE</div>}
      </div>
      {role.modelTier && <div style={mutedCaption(d)}>Tier: {role.modelTier}</div>}
    </div>
  );
}

interface FlowCardProps {
  d: Dir;
  name: string;
  steps: TeamFlowStep[];
}

function FlowCard({ d, name, steps }: FlowCardProps) {
  return (
    <div data-testid={`team-flow-${name}`} style={entryCard(d)}>
      <div style={CARD_HEADER}>
        <div style={optionLabel(d)}>{name}</div>
      </div>
      <ol style={stepList(d)}>
        {steps.map((step) => (
          <li key={step.role}>
            {step.role} · {step.step}
          </li>
        ))}
      </ol>
    </div>
  );
}
