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
  "Read the board with the `taskplanner` tools. Do not pass `workspace_root` — the",
  "server is already pinned to this project's board.",
  "",
  "Work through the board's own states in the order it declares them, and treat the",
  "backlog as the last resort. Within a state, higher priority first — P0 before P1,",
  "and so on — breaking ties by the order tasks appear in the file.",
  "",
  "Skip anything already in **In Progress**: a task being worked is not next, and",
  "nothing here moves it back.",
  "",
  "Skip a task with an assignee. It is that person's to start, not the team's. Name",
  "the assignee and say that is why you passed it over.",
  "",
  "Skip a task with a waiting-until date that has not arrived. It is blocked on",
  "something outside the repository. Name the date and say that is why. This is a",
  "different reason from an assigned task, and the run log should say which applied.",
  "",
  "**Never change or clear an assignee.** Marking work you are proposing as",
  "`@owner` is yours to do; unmarking anything is not.",
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
