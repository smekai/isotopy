import path from "node:path";
import { client } from "@aikirun/client";
import type { Client } from "@aikirun/client";
import { inMemoryQueue, inMemoryTimerPriorityQueue } from "@aikirun/memory";
import { database, migrateApply, server } from "@aikirun/server";
import type { DatabaseConfig, ServerRuntimeConfigOverrides, ServerRuntimeHandle } from "@aikirun/server";
import { worker } from "@aikirun/worker";
import type { WorkerConfigOverrides, WorkerHandle } from "@aikirun/worker";
import { schedule as aikiSchedule } from "@aikirun/workflow";
import type { WorkflowRunStatus } from "@aikirun/workflow";
import type { LimitChoice } from "@isotopy/core";
import { ensureProjectDataDir } from "../paths.ts";
import type { ProjectPath } from "../paths.ts";
import type { ProjectRegistry } from "../services/project-registry.ts";
import { getOrCreate } from "../utils/get-or-create.ts";
import { messageOf } from "../utils/message-of.ts";
import type { Logger } from "../utils/logger.ts";
import { createPipelineWorkflow } from "./pipeline-workflow.ts";
import type { PipelineRunHandle, PipelineWorkflow } from "./pipeline-workflow.ts";
import type { DurableSchedules, ScheduleActivation, ScheduleFiring } from "./durable-schedules.ts";
import { SCHEDULE_WORKFLOW_NAME, createScheduleWorkflow } from "./schedule-workflow.ts";
import type { ScheduleWorkflow } from "./schedule-workflow.ts";
import type { PipelineWorkflowInput, WorkflowDeps } from "./types.ts";

const WORKFLOW_DB_FILE = "aiki.db";

const SERVER_RUNTIME_CONFIG: ServerRuntimeConfigOverrides = {
  daemons: {
    publishPendingOutboxEntries: { intervalMs: 1_000, leaseDurationMs: 2_000 },
    recoverOverdueOutboxEntries: { intervalMs: 1_000, claimIdleTimeoutMs: 6_000 },
  },
};

const SCHEDULE_LIST_LIMIT = 1_000;

const WORKER_CONFIG: WorkerConfigOverrides = {
  maxConcurrentWorkflowRuns: 1,
  gracefulShutdownTimeoutMs: 2_000,
  workflowRun: { claimRefreshIntervalMs: 2_000 },
};

export type DurableRunState = "active" | "completed" | "failed" | "cancelled";

function durableRunState(status: WorkflowRunStatus): DurableRunState {
  switch (status) {
    case "completed":
    case "failed":
    case "cancelled":
      return status;
    case "scheduled":
    case "queued":
    case "running":
    case "paused":
    case "sleeping":
    case "awaiting_event":
    case "awaiting_retry":
    case "awaiting_task_retry":
    case "awaiting_child_workflow":
    case "stalled":
      return "active";
    default:
      return status satisfies never;
  }
}

export interface DurableWorkflows {
  pipeline: PipelineWorkflow;
  schedule: ScheduleWorkflow;
}

interface EmbeddedAiki {
  client: Client<null>;
  close(): Promise<void>;
}

async function openEmbeddedAiki(
  config: DatabaseConfig,
  workflows: DurableWorkflows,
  logger: Logger,
): Promise<EmbeddedAiki> {
  await migrateApply({ db: config, logger });
  const db = database(config);
  const queue = inMemoryQueue();
  const aiki = server({
    db,
    logger,
    timerPriorityQueue: inMemoryTimerPriorityQueue(),
    runtime: { publisher: queue.publisher, config: SERVER_RUNTIME_CONFIG },
  });
  const runtime: ServerRuntimeHandle = aiki.runtime.start();
  const aikiClient = client({ handler: aiki.handler, logger });
  const workers: WorkerHandle[] = [workflows.pipeline, workflows.schedule].map((workflow) =>
    worker({ workflows: [workflow], subscriber: queue.subscriber, config: WORKER_CONFIG }).start(
      aikiClient,
    ),
  );
  return {
    client: aikiClient,
    async close() {
      await Promise.all(workers.map((workerHandle) => workerHandle.stop()));
      await runtime.stop();
      await db.close();
    },
  };
}

export class WorkflowRuntime {
  private embedded?: Promise<EmbeddedAiki>;
  private stopped = false;

  constructor(
    private readonly projectPath: ProjectPath,
    private readonly workflows: DurableWorkflows,
    private readonly aikiLogger: Logger,
    private readonly logger: Logger,
  ) {}

  private ensure(): Promise<EmbeddedAiki> {
    if (this.stopped) {
      return Promise.reject(new Error(`The durable runtime of ${this.projectPath.id} has stopped`));
    }
    this.embedded ??= this.open();
    return this.embedded;
  }

  private async open(): Promise<EmbeddedAiki> {
    await ensureProjectDataDir(this.projectPath);
    const dbPath = path.join(this.projectPath.dataDir, WORKFLOW_DB_FILE);
    try {
      return await openEmbeddedAiki({ provider: "sqlite", path: dbPath }, this.workflows, this.aikiLogger);
    } catch (error) {
      throw new Error(
        `The durable runtime could not open ${dbPath}: ${messageOf(error)}`,
        { cause: error },
      );
    }
  }

  async start(): Promise<void> {
    await this.ensure();
  }

  async startRun(input: PipelineWorkflowInput): Promise<string> {
    const { client: aikiClient } = await this.ensure();
    const handle = await this.workflows.pipeline.start(aikiClient, input);
    return handle.run.id;
  }

  approveGate(durableRunId: string, stageId: string): void {
    this.deliver(durableRunId, (handle) =>
      handle.events.gate.with("reference.id", `gate:${stageId}`).send({ stageId }),
    );
  }

  answerQuestion(durableRunId: string, stageId: string, text: string, messageId: string): void {
    this.deliver(durableRunId, (handle) =>
      handle.events.answer.with("reference.id", messageId).send({ stageId, text }),
    );
  }

  resolveLimit(durableRunId: string, stageId: string, choice: LimitChoice, parkedAt: string): void {
    this.deliver(durableRunId, (handle) =>
      handle.events.limit.with("reference.id", `limit:${stageId}:${parkedAt}`).send({ stageId, choice }),
    );
  }

  async cancel(durableRunId: string): Promise<void> {
    try {
      const handle = await this.handle(durableRunId);
      await handle.cancel();
    } catch (error) {
      this.logger.error(`Durable run ${durableRunId} did not take the cancel`, { error });
    }
  }

  async runState(durableRunId: string): Promise<DurableRunState> {
    const handle = await this.handle(durableRunId);
    return durableRunState(handle.run.state.status);
  }

  private deliver(durableRunId: string, send: (handle: PipelineRunHandle) => Promise<void>): void {
    this.handle(durableRunId)
      .then(send)
      .catch((error: unknown) =>
        this.logger.error(`Durable run ${durableRunId} did not take a delivery`, { error }),
      );
  }

  private async handle(durableRunId: string): Promise<PipelineRunHandle> {
    const { client: aikiClient } = await this.ensure();
    return this.workflows.pipeline.getHandleById(aikiClient, durableRunId);
  }

  async reconcileSchedules(wanted: ScheduleActivation[]): Promise<void> {
    if (wanted.length === 0 && !this.embedded) {
      return;
    }
    const { client: aikiClient } = await this.ensure();
    const kept = new Set<string>();
    for (const activation of wanted) {
      const handle = await aikiSchedule({
        type: "cron",
        expression: activation.cron,
        timezone: activation.timezone,
        overlapPolicy: "skip",
      }).activate(aikiClient, this.workflows.schedule, { scheduleId: activation.scheduleId });
      kept.add(handle.id);
    }
    const { schedules } = await aikiClient.api.schedule.listV1({
      limit: SCHEDULE_LIST_LIMIT,
      filters: {
        status: ["active", "paused"],
        workflows: [{ name: SCHEDULE_WORKFLOW_NAME, source: "user" }],
      },
    });
    for (const { schedule } of schedules) {
      if (!kept.has(schedule.id)) {
        await aikiClient.api.schedule.deactivateV1({ id: schedule.id });
      }
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    const embedded = this.embedded;
    this.embedded = undefined;
    if (embedded) {
      await (await embedded).close();
    }
  }
}

export class WorkflowRuntimeRegistry implements DurableSchedules {
  private readonly runtimes = new Map<string, WorkflowRuntime>();
  private readonly workflows: DurableWorkflows;
  private readonly aikiLogger: Logger;
  private readonly logger: Logger;
  private firing?: ScheduleFiring;

  constructor(
    deps: WorkflowDeps,
    private readonly registry: ProjectRegistry,
    logger: Logger,
  ) {
    this.workflows = {
      pipeline: createPipelineWorkflow(deps),
      schedule: createScheduleWorkflow(() => this.firing),
    };
    this.logger = logger.child("WorkflowRuntime");
    this.aikiLogger = logger.child("Aiki");
  }

  for(projectPath: ProjectPath): WorkflowRuntime {
    return getOrCreate(
      this.runtimes,
      projectPath.id,
      () => new WorkflowRuntime(projectPath, this.workflows, this.aikiLogger, this.logger),
    );
  }

  registerScheduleFiring(firing: ScheduleFiring): void {
    this.firing = firing;
  }

  reconcileSchedules(projectPath: ProjectPath, wanted: ScheduleActivation[]): Promise<void> {
    return this.for(projectPath).reconcileSchedules(wanted);
  }

  forProject(projectId: string): WorkflowRuntime {
    return this.for(this.registry.resolve(projectId));
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.runtimes.values()].map((runtime) => runtime.stop()));
  }
}
