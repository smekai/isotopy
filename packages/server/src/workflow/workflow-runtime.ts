import path from "node:path";
import { OpenWorkflow } from "openworkflow";
import type { Worker, Workflow } from "openworkflow";
import { BackendSqlite } from "openworkflow/sqlite";
import type { ProjectPaths } from "../paths.ts";
import type { ProjectRegistry } from "../services/project-registry.ts";
import { createPipelineWorkflow, gateSignal } from "./pipeline-workflow.ts";
import type { PipelineWorkflowResult } from "./pipeline-workflow.ts";
import type { PipelineWorkflowInput, WorkflowDeps } from "./types.ts";

const RUNS_DB_FILE = "runs.db";

/** OpenWorkflow run statuses that will never transition again. */
const TERMINAL_OW_STATUSES = new Set(["succeeded", "completed", "failed", "canceled"]);

type PipelineWorkflow = Workflow<
  PipelineWorkflowInput,
  PipelineWorkflowResult,
  PipelineWorkflowInput
>;

/**
 * One project's durable-execution runtime: an OpenWorkflow client and an
 * in-process worker over a `BackendSqlite` connection to the project's shared
 * `.adhd/runs.db` (the second connection; our `Database` owns the first). The
 * worker resuming this backend on start is what replaces `reconcileInterrupted`.
 */
export class WorkflowRuntime {
  private backend: BackendSqlite | undefined;
  private client: OpenWorkflow | undefined;
  private worker: Worker | undefined;
  private started = false;

  constructor(
    private readonly paths: ProjectPaths,
    private readonly workflow: PipelineWorkflow,
  ) {}

  private ensure(): { client: OpenWorkflow; backend: BackendSqlite } {
    if (!this.client || !this.backend) {
      this.backend = BackendSqlite.connect(path.join(this.paths.dataDir, RUNS_DB_FILE));
      this.client = new OpenWorkflow({ backend: this.backend });
      this.client.implementWorkflow(this.workflow.spec, this.workflow.fn);
    }
    return { client: this.client, backend: this.backend };
  }

  /** Start the worker so it executes new runs and resumes interrupted ones. */
  async start(): Promise<void> {
    if (this.started) {
      return;
    }
    const { client } = this.ensure();
    this.worker = client.newWorker({ concurrency: 1 });
    await this.worker.start();
    this.started = true;
  }

  /** Enqueue a durable run; returns the OpenWorkflow run id backing it. */
  async startRun(input: PipelineWorkflowInput): Promise<string> {
    const { client } = this.ensure();
    const handle = await client.runWorkflow(this.workflow.spec, input);
    return handle.workflowRun.id;
  }

  async approveGate(runId: string, stageId: string): Promise<void> {
    const { client } = this.ensure();
    await client.sendSignal({ signal: gateSignal(runId, stageId) });
  }

  async cancel(owRunId: string): Promise<void> {
    const { client } = this.ensure();
    try {
      await client.cancelWorkflowRun(owRunId);
    } catch {
      // Already terminal or unknown — cancellation is best-effort here; the
      // in-process subprocess kill (G4) is what makes a cancel immediate.
    }
  }

  /** The backing OpenWorkflow run's status, or undefined if it cannot be read. */
  async runStatus(owRunId: string): Promise<string | undefined> {
    const { backend } = this.ensure();
    try {
      const run = await backend.getWorkflowRun({ workflowRunId: owRunId });
      return run?.status;
    } catch {
      return undefined;
    }
  }

  /** True when the backing OpenWorkflow run has reached a terminal state. */
  async isRunTerminal(owRunId: string): Promise<boolean> {
    const status = await this.runStatus(owRunId);
    return status !== undefined && TERMINAL_OW_STATUSES.has(status);
  }

  async stop(): Promise<void> {
    if (this.worker) {
      await this.worker.stop();
      this.worker = undefined;
    }
    if (this.backend) {
      await this.backend.stop();
      this.backend = undefined;
    }
    this.client = undefined;
    this.started = false;
  }
}

/**
 * Builds the durable workflow once (its body closes over the global read-model
 * writer and services) and hands each project its own {@link WorkflowRuntime}.
 */
export class WorkflowRuntimeRegistry {
  private readonly runtimes = new Map<string, WorkflowRuntime>();
  private readonly workflow: PipelineWorkflow;

  constructor(
    deps: WorkflowDeps,
    private readonly registry: ProjectRegistry,
  ) {
    this.workflow = createPipelineWorkflow(deps);
  }

  for(paths: ProjectPaths): WorkflowRuntime {
    const existing = this.runtimes.get(paths.id);
    if (existing) {
      return existing;
    }
    const runtime = new WorkflowRuntime(paths, this.workflow);
    this.runtimes.set(paths.id, runtime);
    return runtime;
  }

  forProject(projectId: string): WorkflowRuntime {
    return this.for(this.registry.resolve(projectId));
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.runtimes.values()].map((runtime) => runtime.stop()));
  }
}
