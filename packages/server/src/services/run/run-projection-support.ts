import { randomUUID } from "node:crypto";
import type {
  EngineLimit,
  LimitChoice,
  LimitResolution,
  MessageKind,
  MessageRole,
  RunArtifactRecord,
  RunEvent,
  RunMessage,
  RunState,
  RunSummary,
  StageDefinition,
  StageLogDraft,
  StageState,
  StageUsage,
  StageVerdict,
} from "@adhd/core";
import {
  ENGINES,
  addUsage,
  agentForStage,
  isTerminalRunStatus,
  toRunSummary,
} from "@adhd/core";
import { ListenerRegistry } from "../../utils/listener-registry.ts";
import type { StageOutputConsumer } from "../consumers/stage-output-consumer.ts";
import { LIMIT_ERRORS, LIMIT_LOG } from "../../domain/rules/limit-copy.ts";
import {
  formatLimitWait,
  limitWaitMs,
  selectionAfterLimit,
} from "../../domain/rules/engine-limit.ts";
import { formatHandoff } from "../../domain/markdown/stage.ts";
import { nowIso } from "../../utils/time.ts";
import type {
  RunCompletionStatus,
} from "../../workflow/types.ts";
import type { ProjectRegistry } from "../project-registry.ts";
import type { QuestionMediator } from "../question-mediator.ts";
import type { RunReviewer } from "../run-reviewer.ts";
import { persistRunArtifacts } from "../product-manager-closeout.ts";
import type { MilestoneService } from "../milestone/milestone-service.ts";
import type { WorkflowRuntimeRegistry } from "../../workflow/workflow-runtime.ts";
import type { RunStore } from "./run-store.ts";

const UNKNOWN_ENGINE_LABEL = "unknown";

function completionMessage(status: RunCompletionStatus): string {
  if (status === "completed") {
    return "Run completed successfully";
  }
  if (status === "needs_attention") {
    return "Run needs attention";
  }
  return "Run failed";
}

interface MessageDraft {
  role: MessageRole;
  stageId?: string;
  kind?: MessageKind;
  text: string;
}

export abstract class RunProjectionSupport {
  protected abstract readonly store: RunStore;
  protected abstract readonly milestones: MilestoneService;
  protected abstract readonly registry: ProjectRegistry;
  protected abstract readonly runtimes: WorkflowRuntimeRegistry;
  protected abstract readonly stageOutputConsumers: StageOutputConsumer[];
  protected abstract readonly cancelled: Set<string>;
  protected abstract readonly engineAborts: Map<string, AbortController>;
  protected abstract questionMediator?: QuestionMediator;
  protected abstract runReviewer?: RunReviewer;
  protected readonly listeners = new ListenerRegistry<RunEvent>();
  protected readonly projectListeners = new ListenerRegistry<RunSummary>();

  protected appendMessage(run: RunState, draft: MessageDraft): RunMessage {
    const message: RunMessage = {
      id: randomUUID().slice(0, 8),
      ts: nowIso(),
      role: draft.role,
      stageId: draft.stageId,
      kind: draft.kind,
      text: draft.text,
    };
    run.messages.push(message);
    this.emit({
      ts: message.ts,
      type: "run.message",
      runId: run.id,
      stageId: message.stageId,
      chatMessage: message,
    });
    return message;
  }

  bindOpenWorkflowRun(runId: string, openWorkflowRunId: string): void {
    this.store.openWorkflowRunIds.set(runId, openWorkflowRunId);
    void this.store.flushPersist(runId);
  }

  runStarted(runId: string, message: string): void {
    const run = this.live(runId);
    if (!run) {
      return;
    }
    run.status = "running";
    this.emit({ ts: nowIso(), type: "run.started", runId, status: "running", message });
  }

  stageStarted(runId: string, stageId: string): void {
    if (!this.live(runId)) {
      return;
    }
    const stage = this.findStage(runId, stageId);
    if (!stage) {
      return;
    }
    stage.status = "running";
    stage.startedAt = nowIso();
    this.emit({ ts: nowIso(), type: "stage.started", runId, stageId, status: "running" });
  }

  log(runId: string, stageId: string, draft: StageLogDraft): void {
    const stage = this.findStage(runId, stageId);
    if (!stage) {
      return;
    }
    const ts = nowIso();
    stage.logs.push({ ts, ...draft });
    this.emit({ ts, type: "stage.log", runId, stageId, ...draft });
  }

  stageAwaiting(runId: string, stageId: string): void {
    const run = this.live(runId);
    const stage = this.findStage(runId, stageId);
    if (!run || !stage) {
      return;
    }
    stage.status = "awaiting";
    run.status = "awaiting";
    this.emit({
      ts: nowIso(),
      type: "stage.awaiting",
      runId,
      stageId,
      status: "awaiting",
      message: `${agentForStage(stageId).profession} is waiting for your approval`,
    });
  }

  stageAsking(runId: string, stageId: string, question: string): void {
    const run = this.live(runId);
    const stage = this.findStage(runId, stageId);
    if (!run || !stage) {
      return;
    }
    stage.status = "asking";
    run.status = "asking";
    this.appendMessage(run, { role: "agent", stageId, kind: "question", text: question });
    this.emit({
      ts: nowIso(),
      type: "stage.asking",
      runId,
      stageId,
      status: "asking",
      message: question,
    });
  }

  stageQuestion(runId: string, stageId: string, question: string): void {
    const run = this.live(runId);
    if (run) {
      this.appendMessage(run, { role: "agent", stageId, text: question });
    }
  }

  stageMediatedAnswer(runId: string, stageId: string, answer: string): void {
    const run = this.live(runId);
    if (run) {
      this.appendMessage(run, { role: "agent", stageId, text: answer });
    }
  }

  stageAnswered(runId: string, stageId: string): void {
    const run = this.live(runId);
    const stage = this.findStage(runId, stageId);
    if (!run || !stage) {
      return;
    }
    stage.status = "running";
    run.status = "running";
    this.emit({
      ts: nowIso(),
      type: "stage.answered",
      runId,
      stageId,
      status: "running",
      message: `${agentForStage(stageId).profession} is continuing`,
    });
  }

  stageBlocked(runId: string, stageId: string, limit: EngineLimit, attempt: number): void {
    const run = this.live(runId);
    const stage = this.findStage(runId, stageId);
    if (!run || !stage || !run.engine) {
      return;
    }
    const ts = nowIso();
    stage.status = "blocked";
    run.status = "blocked";
    run.limit = {
      stageId,
      engine: run.engine,
      model: run.model,
      raw: limit.raw,
      resetAt: limit.resetAt,
      detectedAt: ts,
      attempt,
    };
    const profession = agentForStage(stageId).profession;
    const message = LIMIT_LOG.blocked(profession, formatLimitWait(limitWaitMs(limit)));
    this.log(runId, stageId, { level: "warn", message });
    this.emit({
      ts,
      type: "stage.blocked",
      runId,
      stageId,
      status: "blocked",
      message,
      limit: run.limit,
    });
  }

  limitResolved(runId: string, stageId: string, choice?: LimitChoice): void {
    const run = this.live(runId);
    const stage = this.findStage(runId, stageId);
    if (!run || !stage || stage.status !== "blocked") {
      return;
    }
    stage.status = "running";
    run.status = "running";
    delete run.limit;
    const profession = agentForStage(stageId).profession;
    const message = LIMIT_LOG.resuming(profession, choice);
    this.log(runId, stageId, { level: "run", message });
    this.emit({
      ts: nowIso(),
      type: "stage.unblocked",
      runId,
      stageId,
      status: "running",
      message,
    });
  }

  resolveLimit(runId: string, stageId: string, resolution: LimitResolution): RunState {
    const run = this.store.runs.get(runId);
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }
    const stage = this.requireStage(runId, stageId);
    if (stage.status !== "blocked") {
      throw new Error(LIMIT_ERRORS.notBlocked(stageId));
    }
    const openWorkflowRunId = this.store.openWorkflowRunIds.get(runId);
    if (!openWorkflowRunId) {
      throw new Error(LIMIT_ERRORS.noDurableRun(runId));
    }

    const selection = selectionAfterLimit({ engine: run.engine, model: run.model }, resolution);
    run.engine = selection.engine;
    if (selection.model === undefined) {
      delete run.model;
    } else {
      run.model = selection.model;
    }
    this.limitResolved(runId, stageId, resolution.choice);
    void this.store.flushPersist(runId);
    void this.runtimes.forProject(run.projectId).resolveLimit(runId, stageId, resolution.choice);
    return structuredClone(run);
  }

  gateApproved(runId: string, stageId: string): void {
    const run = this.live(runId);
    const stage = this.findStage(runId, stageId);
    if (!run || !stage || stage.status !== "awaiting") {
      return;
    }
    const profession = agentForStage(stageId).profession;
    stage.status = "passed";
    stage.completedAt = nowIso();
    run.status = "running";
    this.log(runId, stageId, { level: "pass", message: `✓ Gate approved — ${profession} cleared to proceed` });
    this.emit({
      ts: nowIso(),
      type: "stage.approved",
      runId,
      stageId,
      status: "passed",
      message: `Gate approved for ${profession}`,
    });
  }

  stagePassed(runId: string, stageId: string): void {
    if (!this.live(runId)) {
      return;
    }
    const stage = this.findStage(runId, stageId);
    if (!stage) {
      return;
    }
    stage.completedAt = nowIso();
    stage.status = "passed";
    this.emit({
      ts: nowIso(),
      type: "stage.completed",
      runId,
      stageId,
      status: "passed",
      message: `${agentForStage(stageId).profession} completed`,
    });
  }

  stageSkipped(runId: string, stageId: string): void {
    if (!this.live(runId)) {
      return;
    }
    const stage = this.findStage(runId, stageId);
    if (!stage) {
      return;
    }
    const completedAt = nowIso();
    stage.completedAt = completedAt;
    stage.status = "skipped";
    this.emit({
      ts: completedAt,
      type: "stage.skipped",
      runId,
      stageId,
      status: "skipped",
      message: `${agentForStage(stageId).profession} skipped`,
    });
  }

  stageFailed(runId: string, stageId: string, message: string): void {
    if (!this.live(runId)) {
      return;
    }
    const stage = this.findStage(runId, stageId);
    if (!stage) {
      return;
    }
    stage.completedAt = nowIso();
    stage.status = "failed";
    this.log(runId, stageId, { level: "fail", message: `✗ ${message}` });
    this.emit({ ts: nowIso(), type: "stage.failed", runId, stageId, status: "failed", message });
  }

  setVerdict(runId: string, stageId: string, verdict: StageVerdict): void {
    const stage = this.findStage(runId, stageId);
    if (stage) {
      stage.verdict = verdict;
    }
  }

  stageUsage(runId: string, stageId: string, usage: StageUsage): void {
    const stage = this.findStage(runId, stageId);
    if (!stage) {
      return;
    }
    stage.usage = addUsage(stage.usage, usage);
    this.emit({ ts: nowIso(), type: "stage.usage", runId, stageId, usage: stage.usage });
    void this.store.flushPersist(runId);
  }

  async captureStageOutput(
    runId: string,
    stageDef: StageDefinition,
    output: string,
  ): Promise<void> {
    const run = this.live(runId);
    if (!run || output.trim() === "") {
      return;
    }
    run.stageOutputs = { ...run.stageOutputs, [stageDef.id]: output };
    run.result = output;
    await this.store.repositoryForRun(runId).writeHandoff(
      runId,
      stageDef.id,
      formatHandoff(
        {
          stageLabel: stageDef.label,
          profession: agentForStage(stageDef.id).profession,
          engine: this.engineLabel(run),
          model: run.model,
          completedAt: nowIso(),
        },
        output,
      ),
    );
    for (const consumer of this.stageOutputConsumers) {
      await consumer.consume(run, stageDef, output);
    }
    void this.store.flushPersist(runId);
  }

  async captureRunArtifacts(runId: string, record: RunArtifactRecord): Promise<void> {
    const run = this.live(runId);
    if (!run) {
      return;
    }
    run.artifacts = record;
    await persistRunArtifacts(this.registry.resolve(run.projectId), runId, record);
    void this.store.flushPersist(runId);
  }

  applySeededOutput(runId: string, stageDef: StageDefinition, output: string): void {
    const run = this.live(runId);
    const stage = this.findStage(runId, stageDef.id);
    if (!run || !stage) {
      return;
    }
    run.stageOutputs = { ...run.stageOutputs, [stageDef.id]: output };
    run.result = output;
  }

  runCompleted(runId: string, status: RunCompletionStatus): void {
    const run = this.live(runId);
    if (!run) {
      return;
    }
    run.status = status;
    run.completedAt = nowIso();
    this.emit({
      ts: nowIso(),
      type: "run.completed",
      runId,
      status,
      message: completionMessage(status),
      result: run.result,
    });
    void this.settleCompletedRun(run);
  }

  protected markCancelled(runId: string): void {
    const run = this.store.runs.get(runId);
    if (!run || isTerminalRunStatus(run.status)) {
      return;
    }
    for (const stage of run.stages) {
      if (
        stage.status === "pending" ||
        stage.status === "running" ||
        stage.status === "awaiting" ||
        stage.status === "asking" ||
        stage.status === "blocked"
      ) {
        stage.status = "skipped";
        this.emit({ ts: nowIso(), type: "stage.skipped", runId, stageId: stage.id, status: "skipped" });
      }
    }
    delete run.limit;
    run.status = "cancelled";
    run.completedAt = nowIso();
    this.emit({
      ts: nowIso(),
      type: "run.completed",
      runId,
      status: "cancelled",
      message: "Run aborted",
    });
  }

  protected markInterrupted(runId: string): void {
    const run = this.store.runs.get(runId);
    if (!run || isTerminalRunStatus(run.status)) {
      return;
    }
    const ts = nowIso();
    for (const stage of run.stages) {
      if (
        stage.status === "running" ||
        stage.status === "awaiting" ||
        stage.status === "asking" ||
        stage.status === "blocked"
      ) {
        stage.status = "failed";
        stage.completedAt = ts;
        this.log(runId, stage.id, {
          level: "fail",
          message: "✗ Interrupted by server restart",
        });
      }
    }
    delete run.limit;
    run.status = "failed";
    run.completedAt = ts;
    this.emit({
      ts,
      type: "run.completed",
      runId,
      status: "failed",
      message: "Interrupted by server restart",
    });
    void this.settleCompletedRun(run);
  }

  protected beginEngineStage(runId: string): AbortController {
    const controller = new AbortController();
    this.engineAborts.set(runId, controller);
    return controller;
  }

  protected endEngineStage(runId: string): void {
    this.engineAborts.delete(runId);
  }

  protected live(runId: string): RunState | undefined {
    const run = this.store.runs.get(runId);
    return run && !isTerminalRunStatus(run.status) ? run : undefined;
  }

  protected findStage(runId: string, stageId: string): StageState | undefined {
    return this.store.runs.get(runId)?.stages.find((stage) => stage.id === stageId);
  }

  protected requireStage(runId: string, stageId: string): StageState {
    const stage = this.findStage(runId, stageId);
    if (!stage) {
      throw new Error(`Stage not found: ${stageId}`);
    }
    return stage;
  }

  protected engineLabel(run: RunState): string {
    return run.engine ? ENGINES[run.engine].label : UNKNOWN_ENGINE_LABEL;
  }

  protected emit(event: RunEvent): void {
    void this.store.repositoryForRun(event.runId)
      .appendEvent(event.runId, event)
      .catch((error) => console.warn(`Failed to persist event for run ${event.runId}:`, error));
    if (event.type !== "stage.log") {
      void this.store.flushPersist(event.runId);
    }
    this.listeners.emit(event.runId, event);
    this.publishSummary(event);
  }

  protected publishSummary(event: RunEvent): void {
    if (event.type === "stage.log") {
      return;
    }
    const run = this.store.runs.get(event.runId);
    if (!run || !this.projectListeners.has(run.projectId)) {
      return;
    }
    this.projectListeners.emit(run.projectId, toRunSummary(run));
  }

  protected async settleCompletedRun(run: RunState): Promise<void> {
    await this.store.repositoryForRun(run.id).releaseRun(run.id);
    await this.milestones.completeMilestoneRun(run);
    await this.runReviewer?.settle(run.id);
  }
}
