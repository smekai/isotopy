import path from "node:path";
import { OpenWorkflow } from "openworkflow";
import type { Worker, Workflow } from "openworkflow";
import { BackendSqlite } from "openworkflow/sqlite";
import type { LimitChoice } from "@isotopy/core";
import { ensureProjectDataDir } from "../paths.ts";
import type { ProjectPath } from "../paths.ts";
import type { ProjectRegistry } from "../services/project-registry.ts";
import {
  answerSignal,
  createPipelineWorkflow,
  gateSignal,
  limitSignal,
} from "./pipeline-workflow.ts";
import { getOrCreate } from "../utils/get-or-create.ts";
import type { Logger } from "../utils/logger.ts";
import { WakeableDelay } from "../utils/wakeable-delay.ts";
import type { PipelineWorkflowResult } from "./pipeline-workflow.ts";
import type { PipelineWorkflowInput, WorkflowDeps } from "./types.ts";

const WORKFLOW_DB_FILE = "workflow.db";

type PipelineWorkflow = Workflow<
  PipelineWorkflowInput,
  PipelineWorkflowResult,
  PipelineWorkflowInput
>;

const POLL_MIN_MS = 10;
const POLL_MAX_MS = 1000;

export class WorkflowRuntime {
  private backend?: BackendSqlite;
  private client?: OpenWorkflow;
  private worker?: Worker;
  private polling?: Promise<void>;
  private readonly idle = new WakeableDelay();
  private started = false;

  constructor(
    private readonly projectPath: ProjectPath,
    private readonly workflow: PipelineWorkflow,
    private readonly logger: Logger,
  ) {}

  private async ensure(): Promise<{ client: OpenWorkflow; backend: BackendSqlite }> {
    if (!this.client || !this.backend) {
      await ensureProjectDataDir(this.projectPath);
      this.backend = BackendSqlite.connect(
        path.join(this.projectPath.dataDir, WORKFLOW_DB_FILE),
      );
      this.client = new OpenWorkflow({ backend: this.backend });
      this.client.implementWorkflow(this.workflow.spec, async (context) => {
        try {
          return await this.workflow.fn(context);
        } finally {
          this.idle.wake();
        }
      });
    }
    return { client: this.client, backend: this.backend };
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }
    const { client } = await this.ensure();
    const worker = client.newWorker({ concurrency: 1 });
    this.worker = worker;
    this.started = true;
    this.polling = this.poll(worker);
  }

  private async poll(worker: Worker): Promise<void> {
    let idleMs = POLL_MIN_MS;
    while (this.started) {
      if ((await this.tick(worker)) > 0) {
        idleMs = POLL_MIN_MS;
        continue;
      }
      const woken = await this.idle.wait(idleMs);
      idleMs = woken ? POLL_MIN_MS : Math.min(idleMs * 2, POLL_MAX_MS);
    }
  }

  private async tick(worker: Worker): Promise<number> {
    try {
      return await worker.tick();
    } catch (error) {
      this.logger.error(`The durable worker of project ${this.projectPath.id} failed to poll`, {
        error,
      });
      return 0;
    }
  }

  async startRun(input: PipelineWorkflowInput): Promise<string> {
    const { client } = await this.ensure();
    const handle = await client.runWorkflow(this.workflow.spec, input);
    this.idle.wake();
    return handle.workflowRun.id;
  }

  async approveGate(runId: string, stageId: string): Promise<void> {
    await this.signal({ signal: gateSignal(runId, stageId) });
  }

  async answerQuestion(runId: string, stageId: string, text: string): Promise<void> {
    await this.signal({ signal: answerSignal(runId, stageId), data: { text } });
  }

  async resolveLimit(runId: string, stageId: string, choice: LimitChoice): Promise<void> {
    await this.signal({ signal: limitSignal(runId, stageId), data: { choice } });
  }

  private async signal(options: Parameters<OpenWorkflow["sendSignal"]>[0]): Promise<void> {
    const { client } = await this.ensure();
    await client.sendSignal(options);
    this.idle.wake();
  }

  async cancel(openWorkflowRunId: string): Promise<void> {
    const { client } = await this.ensure();
    await client.cancelWorkflowRun(openWorkflowRunId);
    this.idle.wake();
  }

  async runStatus(openWorkflowRunId: string): Promise<string | undefined> {
    const { backend } = await this.ensure();
    const run = await backend.getWorkflowRun({ workflowRunId: openWorkflowRunId });
    return run?.status;
  }

  async stop(): Promise<void> {
    this.started = false;
    this.idle.wake();
    await this.polling;
    this.polling = undefined;
    if (this.worker) {
      await this.worker.stop();
      this.worker = undefined;
    }
    if (this.backend) {
      await this.backend.stop();
      this.backend = undefined;
    }
    this.client = undefined;
  }
}

export class WorkflowRuntimeRegistry {
  private readonly runtimes = new Map<string, WorkflowRuntime>();
  private readonly workflow: PipelineWorkflow;

  constructor(
    deps: WorkflowDeps,
    private readonly registry: ProjectRegistry,
    private readonly logger: Logger,
  ) {
    this.workflow = createPipelineWorkflow(deps);
  }

  for(projectPath: ProjectPath): WorkflowRuntime {
    return getOrCreate(
      this.runtimes,
      projectPath.id,
      () => new WorkflowRuntime(projectPath, this.workflow, this.logger),
    );
  }

  forProject(projectId: string): WorkflowRuntime {
    return this.for(this.registry.resolve(projectId));
  }

  async stop(projectId: string): Promise<void> {
    const runtime = this.runtimes.get(projectId);
    this.runtimes.delete(projectId);
    await runtime?.stop();
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.runtimes.values()].map((runtime) => runtime.stop()));
  }
}
