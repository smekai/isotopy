import type { OrchestratorTeamProposal } from "@isotopy/core";

export const SOLO_READER: OrchestratorTeamProposal = {
  name: "Board reader",
  summary: "One persona, one step: read the board and name what comes next.",
  roles: [
    {
      id: "reader",
      label: "Project Manager",
      skill: "project-manager",
      stepTask: "plan-feature",
    },
  ],
};
