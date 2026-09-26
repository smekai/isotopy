import { createHash } from "node:crypto";
import path from "node:path";
import type {
  CreatedTaskReference,
  FollowUpTaskDraft,
  Milestone,
  MilestoneProposal,
  MilestoneTaskDraft,
  RunState,
} from "@isotopy/core";
import { Priority, boardExists, openBoard, renderBoardDigest } from "@smekai/taskplanner";
import type { OpenedBoard, Task, TaskPlannerConfig } from "@smekai/taskplanner";
import type { ProjectPath } from "../paths.ts";
import { getOrCreate } from "../utils/get-or-create.ts";
import { nowIso } from "../utils/time.ts";

export interface ApprovedTaskLinks {
  featureTaskIds: Record<string, string[]>;
}

export type TaskTransitionState = "Next" | "In Progress" | "Done";

export interface TransitionTasksOptions {
  onlyFrom?: TaskTransitionState;
}

const BOARD_DIR = ".tasks";

const BACKLOG_STATE = "Backlog";

const SOURCE_ATTRIBUTE = "Isotopy source";

const ORIGIN_ATTRIBUTE = "Isotopy origin";

const CONTEXT_DESCRIPTION_LIMIT = 320;

const adapters = new Map<string, TaskBoardAdapter>();

export function taskBoardFor(projectPath: ProjectPath): TaskBoardAdapter {
  return getOrCreate(adapters, projectPath.root, () => new TaskBoardAdapter(projectPath));
}

export class TaskBoardAdapter {
  constructor(private readonly projectPath: ProjectPath) {}

  async tasksContext(): Promise<string> {
    const board = this.open(false);
    if (!board) {
      return "No existing task board is configured.";
    }
    const states = board.taskStore.config.states.map((state) => ({
      name: state.name,
      tasks: board.taskStore.getTasksByState(state.name),
    }));
    return renderBoardDigest(states, {
      includeTasks: true,
      descriptionLimit: CONTEXT_DESCRIPTION_LIMIT,
    });
  }

  async approveMilestoneTasks(
    milestone: Milestone,
    proposal: MilestoneProposal,
  ): Promise<ApprovedTaskLinks> {
    const board = this.openOrThrow();
    const known = board.taskStore.knownTaskIds();
    const requested = proposal.features.flatMap((feature) => feature.existingTaskIds);
    const missing = [...new Set(requested)].filter((id) => !known.has(id));
    if (missing.length > 0) {
      throw new Error(`Existing task IDs were not found: ${missing.join(", ")}`);
    }

    const featureTaskIds: Record<string, string[]> = {};
    for (const feature of proposal.features) {
      const ids = [...feature.existingTaskIds];
      for (const draft of feature.taskDrafts) {
        const origin = fingerprint(milestone.id, feature.id, draft.id);
        const source = `milestone ${milestone.id} · feature ${feature.id}`;
        draft.createdTaskId = this.upsert(board, origin, () =>
          task(board.taskStore.config, draft, source, origin),
        );
        ids.push(draft.createdTaskId);
      }
      featureTaskIds[feature.id] = [...new Set(ids)];
    }
    return { featureTaskIds };
  }

  async createFollowUpTasks(
    run: RunState,
    drafts: FollowUpTaskDraft[],
  ): Promise<CreatedTaskReference[]> {
    if (drafts.length === 0) return [];
    const board = this.openOrThrow();

    return drafts.flatMap((draft) => {
      const origin = findingFingerprint(run, draft.findingId);
      if (board.taskStore.findTaskByAttribute(ORIGIN_ATTRIBUTE, origin)) {
        return [];
      }
      const created = board.taskStore.createTask(
        task(board.taskStore.config, draft, followUpSource(run, draft), origin),
        BACKLOG_STATE,
      );
      return [{ id: created.id, title: draft.title }];
    });
  }

  async transitionTasks(
    ids: string[],
    targetStateName: TaskTransitionState,
    runId: string,
    options: TransitionTasksOptions = {},
  ): Promise<string[]> {
    if (ids.length === 0) return [];
    const board = this.open(false);
    if (!board) return [];

    const moved = [...new Set(ids)].filter((id) => {
      if (options.onlyFrom !== undefined) {
        const found = board.taskStore.findTask(id);
        if (!found || found.stateName !== options.onlyFrom) {
          return false;
        }
      }
      return board.taskStore.moveTask(id, targetStateName) !== null;
    });
    if (targetStateName === "Done") {
      for (const id of [...moved].reverse()) {
        board.fileStore.prependWorkLogEntry({
          id,
          date: nowIso().slice(0, 10),
          what: `Completed by Full Delivery run ${runId}.`,
          outcome: "Evidence and follow-ups are recorded in the run closeout.",
        });
      }
    }
    return moved;
  }

  private upsert(board: OpenedBoard, origin: string, build: () => Omit<Task, "id">): string {
    const existing = board.taskStore.findTaskByAttribute(ORIGIN_ATTRIBUTE, origin);
    return existing ? existing.task.id : board.taskStore.createTask(build(), BACKLOG_STATE).id;
  }

  private openOrThrow(): OpenedBoard {
    const board = this.open(true);
    if (!board) {
      throw new Error("Task board is unavailable");
    }
    return board;
  }

  // Opened every call so a board edited by hand or by another agent mid-session is read
  // as it is now, not as it was when this adapter first saw it.
  private open(create: boolean): OpenedBoard | undefined {
    const tasksDir = path.join(this.projectPath.root, BOARD_DIR);
    if (!create && !boardExists(tasksDir)) {
      return undefined;
    }
    const board = openBoard(tasksDir, { initialize: create });
    if (board.configManager.isConfigUnreadable()) {
      throw new Error(
        `Invalid task board config ${path.join(tasksDir, "config.json")}: ${board.configManager
          .getDiagnostics()
          .map((diagnostic) => diagnostic.message)
          .join("; ")}`,
      );
    }
    board.taskStore.ensureAllDeferredStatesLoaded();
    return board;
  }
}

function fingerprint(milestoneId: string, featureId: string, taskId: string): string {
  return digest(`${milestoneId}:${featureId}:${taskId}`);
}

function findingFingerprint(run: RunState, findingId: string): string {
  return digest(
    [
      run.milestoneId ?? "no-milestone",
      run.featureId ?? "no-feature",
      run.id,
      findingId,
    ].join(":"),
  );
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function followUpSource(run: RunState, draft: FollowUpTaskDraft): string {
  return [
    run.milestoneId ? `milestone ${run.milestoneId}` : undefined,
    run.featureId ? `feature ${run.featureId}` : undefined,
    `run ${run.id}`,
    `finding ${draft.findingId}`,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}

function task(
  config: TaskPlannerConfig,
  draft: MilestoneTaskDraft | FollowUpTaskDraft,
  source: string,
  origin: string,
): Omit<Task, "id"> {
  const allowed = new Set(config.tags ?? []);
  return {
    title: draft.title,
    description: draft.description.trim(),
    priority: Priority[draft.priority],
    tags: draft.tags.filter((tag) => allowed.size === 0 || allowed.has(tag)),
    assignee: draft.assignee,
    attributes: { [SOURCE_ATTRIBUTE]: source, [ORIGIN_ATTRIBUTE]: origin },
  };
}
