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
  "**Only unstarted work is eligible.** Never take a task from **Done** or",
  "**Rejected** — that work is finished, and nothing here reopens it. Never take",
  "one from **In Progress**: a task being worked is not next, and nothing here",
  "moves it back.",
  "",
  "Among the states that remain, work through them in the order the board declares",
  "them and treat the backlog as the last resort. Within a state, higher priority",
  "first — P0 before P1, and so on — breaking ties by the order tasks appear in the",
  "file.",
  "",
  "Skip a task with an assignee. It is that person's to start, not the team's. Name",
  "the assignee and say that is why you passed it over.",
  "",
  "Skip a task with a waiting-until date that has not arrived. It is blocked on",
  "something outside the repository. Name the date and say that is why. This is a",
  "different reason from an assigned task, and the run log should say which applied.",
  "",
  "**Never change or clear an assignee.** Setting one belongs to the steps that",
  "draft new tasks; unmarking belongs to nobody.",
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
