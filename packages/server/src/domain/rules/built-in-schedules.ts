import type { OrchestratorTeamProposal } from "@isotopy/core";

export interface BuiltInSchedule {
  key: string;
  name: string;
  cron: string;
  timezone: string;
  task: string;
  team?: OrchestratorTeamProposal;
}

const BOARD_POLLER_TASK = [
  "Check the task board and take the next thing off it.",
  "",
  "Draw from **Next** first, and only from **Backlog** once Next is empty. Within a",
  "state, higher priority first — P0 before P1, and so on — breaking ties by the",
  "order tasks appear in the file.",
  "",
  "Skip anything already in **In Progress**: a task being worked is not next, and",
  "nothing here moves it back.",
  "",
  "Skip anything that needs a person — work that spends money, needs a credential,",
  "or asks for a preference only the user holds. Say what you skipped and why.",
  "",
  "If nothing qualifies, stop and say the board has nothing ready. Do not invent",
  "work that is not on it.",
].join("\n");

export const BUILT_IN_SCHEDULES = [
  {
    key: "board-poller",
    name: "Board poller",
    cron: "0 9 * * *",
    timezone: "UTC",
    task: BOARD_POLLER_TASK,
  },
] as const satisfies readonly BuiltInSchedule[];
