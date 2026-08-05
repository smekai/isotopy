import path from "node:path";
import { OpenWorkflow } from "openworkflow";
import type { Worker, Workflow } from "openworkflow";
import { BackendSqlite } from "openworkflow/sqlite";
import type { LimitChoice } from "@adhd/core";
import { ensureProjectDataDir } from "../paths.ts";
import type { ProjectPath } from "../paths.ts";
import type { ProjectRegistry } from "../services/project-registry.ts";
import {
  answerSignal,
  createPipelineWorkflow,
  gateSignal,
  limitSignal,
} from "./pipeline-workflow.ts";
import type { PipelineWorkflowResult } from "./pipeline-workflow.ts";
import type { PipelineWorkflowInput, WorkflowDeps } from "./types.ts";

const WORKFLOW_DB_FILE = "workflow.db";

type PipelineWorkflow = Workflow<
  PipelineWorkflowInput,
  PipelineWorkflowResult,
  PipelineWorkflowInput
>;

export class WorkflowRuntime {
  private backend?: BackendSqlite;
  private client?: OpenWorkflow;
  private worker?: Worker;
  private started = false;

  constructor(
    private readonly projectPath: ProjectPath,
    private readonly workflow: PipelineWorkflow,
  ) {}

  private async ensure(): Promise<{ client: OpenWorkflow; backend: BackendSqlite }> {
    if (!this.client || !this.backend) {
      await ensureProjectDataDir(this.projectPath);
      this.backend = BackendSqlite.connect(
        path.join(this.projectPath.dataDir, WORKFLOW_DB_FILE),
      );
      this.client = new OpenWorkflow({ backend: this.backend });
      this.client.implementWorkflow(this.workflow.spec, this.workflow.fn);
    }
    return { client: this.client, backend: this.backend };
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }
    const { client } = await this.ensure();
    this.worker = client.newWorker({ concurrency: 1 });
    await this.worker.start();
    this.started = true;
  }

  async startRun(input: PipelineWorkflowInput): Promise<string> {
    const { client } = await this.ensure();
    const handle = await client.runWorkflow(this.workflow.spec, input);
    return handle.workflowRun.id;
  }

  async approveGate(runId: string, stageId: string): Promise<void> {
    const { client } = await this.ensure();
    await client.sendSignal({ signal: gateSignal(runId, stageId) });
  }

  async answerQuestion(runId: string, stageId: string, text: string): Promise<void> {
    const { client } = await this.ensure();
    await client.sendSignal({ signal: answerSignal(runId, stageId), data: { text } });
  }

  async resolveLimit(runId: string, stageId: string, choice: LimitChoice): Promise<void> {
    const { client } = await this.ensure();
    await client.sendSignal({ signal: limitSignal(runId, stageId), data: { choice } });
  }

  async cancel(openWorkflowRunId: string): Promise<void> {
    const { client } = await this.ensure();
    await client.cancelWorkflowRun(openWorkflowRunId);
  }

  async runStatus(openWorkflowRunId: string): Promise<string | undefined> {
    const { backend } = await this.ensure();
    const run = await backend.getWorkflowRun({ workflowRunId: openWorkflowRunId });
    return run?.status;
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

export class WorkflowRuntimeRegistry {
  private readonly runtimes = new Map<string, WorkflowRuntime>();
  private readonly workflow: PipelineWorkflow;

  constructor(
    deps: WorkflowDeps,
    private readonly registry: ProjectRegistry,
  ) {
    this.workflow = createPipelineWorkflow(deps);
  }

  for(projectPath: ProjectPath): WorkflowRuntime {
    const existing = this.runtimes.get(projectPath.id);
    if (existing) {
      return existing;
    }
    const runtime = new WorkflowRuntime(projectPath, this.workflow);
    this.runtimes.set(projectPath.id, runtime);
    return runtime;
  }

  forProject(projectId: string): WorkflowRuntime {
    return this.for(this.registry.resolve(projectId));
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.runtimes.values()].map((runtime) => runtime.stop()));
  }
}
