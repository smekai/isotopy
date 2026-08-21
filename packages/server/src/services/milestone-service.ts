import { randomUUID } from "node:crypto";
import type {
  Milestone,
  MilestoneFeature,
  MilestonePlan,
  UpdateMilestoneInput,
  RunState,
} from "@isotopy/core";
import {
  canAcceptMilestoneFeature,
  requestedMilestoneFeature,
  toMilestoneProposal,
} from "@isotopy/core";
import type {
  CreateMilestoneFeatureInput,
  CreateMilestoneInput,
  UpdateMilestoneFeatureInput,
} from "../schemas/request-schemas.ts";
import {
  renderMilestonePlanningContext,
  renderMilestoneRevisionContext,
} from "../domain/markdown/planning.ts";
import type { ProjectPath } from "../paths.ts";
import { MilestoneRepository } from "../repository/milestone-repository.ts";
import { nowIso } from "../utils/time.ts";
import {
  milestoneCloseoutContext,
  persistMilestoneSummary,
} from "./milestone-closeout.ts";
import type { ProjectRegistry } from "./project-registry.ts";
import { getOrCreate } from "../utils/get-or-create.ts";
import { messageOf } from "../utils/message-of.ts";
import { taskBoardFor } from "./task-board-adapter.ts";
import type { RunService, StartRunOptions } from "./run/run-service.ts";

export class MilestoneService {
  private readonly milestoneRepositories = new Map<string, MilestoneRepository>();
  private readonly milestones = new Map<string, Milestone>();
  private readonly completingMilestoneRuns = new Set<string>();

  constructor(
    private readonly registry: ProjectRegistry,
    private readonly runs: () => RunService,
  ) {}

  async loadProject(projectPath: ProjectPath): Promise<void> {
    for (const milestone of await this.milestoneRepositoryFor(projectPath).loadAll()) {
      milestone.projectId = projectPath.id;
      this.milestones.set(milestone.id, milestone);
    }
  }

  async settle(): Promise<void> {
    await Promise.all(
      [...this.milestoneRepositories.values()].map((repository) =>
        repository.settle(),
      ),
    );
  }

  listMilestones(projectId: string): Milestone[] {
    return [...this.milestones.values()]
      .filter((milestone) => milestone.projectId === projectId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((milestone) => structuredClone(milestone));
  }

  getMilestone(milestoneId: string): Milestone | undefined {
    const milestone = this.milestones.get(milestoneId);
    return milestone ? structuredClone(milestone) : undefined;
  }

  mutableMilestone(milestoneId: string): Milestone | undefined {
    return this.milestones.get(milestoneId);
  }

  saveMilestone(milestone: Milestone): Promise<void> {
    return this.persistMilestone(milestone);
  }

  async createMilestone(
    projectPath: ProjectPath,
    input: CreateMilestoneInput,
  ): Promise<Milestone> {
    const name = input.name.trim();
    if (!name) {
      throw new Error("Milestone name is required");
    }
    const now = nowIso();
    const milestone: Milestone = {
      id: randomUUID().slice(0, 8),
      projectId: projectPath.id,
      name,
      goal: input.goal?.trim() || undefined,
      status: input.status ?? "active",
      autoRunNext: input.autoRunNext ?? false,
      features: (input.features ?? []).map((feature) =>
        this.newMilestoneFeature(feature, now),
      ),
      planningRunIds: [],
      createdAt: now,
      updatedAt: now,
    };
    this.milestones.set(milestone.id, milestone);
    await this.persistMilestone(milestone);
    return structuredClone(milestone);
  }

  async startMilestonePlanning(
    projectPath: ProjectPath,
    goalInput: string,
    options: Omit<StartRunOptions, "task" | "milestoneId" | "featureId">,
  ): Promise<RunState> {
    const goal = goalInput.trim();
    if (!goal) {
      throw new Error("Milestone goal is required");
    }
    const milestone = await this.createMilestone(projectPath, {
      name: "Draft milestone",
      goal,
      status: "draft",
    });
    return this.startPlanningTurn(projectPath, milestone.id, goal, options);
  }

  async reviseMilestonePlan(
    projectPath: ProjectPath,
    milestoneId: string,
    feedbackInput: string,
    options: Omit<StartRunOptions, "task" | "milestoneId" | "featureId">,
  ): Promise<RunState> {
    const milestone = this.requireMilestone(projectPath.id, milestoneId);
    if (milestone.status !== "draft") {
      throw new Error("Only draft milestones can be revised");
    }
    const feedback = feedbackInput.trim();
    if (!feedback) {
      throw new Error("Revision feedback is required");
    }
    const task = renderMilestoneRevisionContext(
      milestone.goal ?? milestone.name,
      milestone.proposal,
      feedback,
    );
    return this.startPlanningTurn(projectPath, milestone.id, task, options);
  }

  async updateMilestoneProposal(
    projectPath: ProjectPath,
    milestoneId: string,
    plan: MilestonePlan,
  ): Promise<Milestone> {
    const milestone = this.requireMilestone(projectPath.id, milestoneId);
    if (milestone.status !== "draft") {
      throw new Error("Only draft milestone proposals can be edited");
    }
    milestone.proposal = toMilestoneProposal(
      plan,
      (milestone.proposal?.revision ?? 0) + 1,
      nowIso(),
    );
    milestone.name = plan.name;
    milestone.goal = plan.goal;
    delete milestone.approvalError;
    milestone.updatedAt = nowIso();
    await this.persistMilestone(milestone);
    return structuredClone(milestone);
  }

  async approveMilestonePlan(
    projectPath: ProjectPath,
    milestoneId: string,
  ): Promise<Milestone> {
    const milestone = this.requireMilestone(projectPath.id, milestoneId);
    if (milestone.status !== "draft") {
      throw new Error("Only draft milestones can be approved");
    }
    if (!milestone.proposal) {
      throw new Error("Milestone has no valid proposal");
    }
    try {
      const links = await taskBoardFor(projectPath).approveMilestoneTasks(
        milestone,
        milestone.proposal,
      );
      const now = nowIso();
      milestone.features = milestone.proposal.features.map((feature) => ({
        id: feature.id,
        title: feature.title,
        description: feature.description,
        acceptanceCriteria: [...feature.acceptanceCriteria],
        status: "ready",
        taskIds: links.featureTaskIds[feature.id] ?? [],
        runIds: [],
        findings: [],
        createdAt: now,
        updatedAt: now,
      }));
      milestone.name = milestone.proposal.name;
      milestone.goal = milestone.proposal.goal;
      milestone.status = "active";
      milestone.updatedAt = now;
      delete milestone.approvalError;
      await this.persistMilestone(milestone);
      return structuredClone(milestone);
    } catch (error) {
      milestone.approvalError = messageOf(error);
      milestone.updatedAt = nowIso();
      await this.persistMilestone(milestone);
      throw error;
    }
  }

  async updateMilestone(
    projectPath: ProjectPath,
    milestoneId: string,
    input: UpdateMilestoneInput,
  ): Promise<Milestone> {
    const milestone = this.requireMilestone(projectPath.id, milestoneId);
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) {
        throw new Error("Milestone name cannot be empty");
      }
      milestone.name = name;
    }
    if (input.goal !== undefined) {
      if (input.goal === null || input.goal.trim() === "") {
        delete milestone.goal;
      } else {
        milestone.goal = input.goal.trim();
      }
    }
    if (input.autoRunNext !== undefined) {
      milestone.autoRunNext = input.autoRunNext;
    }
    if (input.status !== undefined) {
      milestone.status = input.status;
      if (input.status === "completed") {
        milestone.completedAt = nowIso();
      } else {
        delete milestone.completedAt;
      }
    }
    milestone.updatedAt = nowIso();
    await this.persistMilestone(milestone);
    return structuredClone(milestone);
  }

  async addMilestoneFeature(
    projectPath: ProjectPath,
    milestoneId: string,
    input: CreateMilestoneFeatureInput,
  ): Promise<Milestone> {
    const milestone = this.requireMilestone(projectPath.id, milestoneId);
    const now = nowIso();
    milestone.features.push(this.newMilestoneFeature(input, now));
    milestone.updatedAt = now;
    await this.persistMilestone(milestone);
    return structuredClone(milestone);
  }

  async updateMilestoneFeature(
    projectPath: ProjectPath,
    milestoneId: string,
    featureId: string,
    input: UpdateMilestoneFeatureInput,
  ): Promise<Milestone> {
    const milestone = this.requireMilestone(projectPath.id, milestoneId);
    const feature = this.requireMilestoneFeature(milestone, featureId);
    if (input.title !== undefined) {
      const title = input.title.trim();
      if (!title) {
        throw new Error("Feature title cannot be empty");
      }
      feature.title = title;
    }
    if (input.description !== undefined) {
      if (input.description === null || input.description.trim() === "") {
        delete feature.description;
      } else {
        feature.description = input.description.trim();
      }
    }
    if (input.acceptanceCriteria !== undefined) {
      feature.acceptanceCriteria = this.cleanStrings(input.acceptanceCriteria);
    }
    if (input.taskIds !== undefined) {
      feature.taskIds = this.cleanStrings(input.taskIds);
    }
    if (input.status !== undefined) {
      feature.status = input.status;
      if (input.status === "completed") {
        feature.completedAt = nowIso();
      } else {
        delete feature.completedAt;
        delete feature.acceptedAt;
      }
    }
    const now = nowIso();
    feature.updatedAt = now;
    milestone.updatedAt = now;
    await this.persistMilestone(milestone);
    return structuredClone(milestone);
  }

  async acceptMilestoneFeature(
    projectPath: ProjectPath,
    milestoneId: string,
    featureId: string,
  ): Promise<Milestone> {
    const milestone = this.requireMilestone(projectPath.id, milestoneId);
    const feature = this.requireMilestoneFeature(milestone, featureId);
    if (!canAcceptMilestoneFeature(feature)) {
      throw new Error("Only a feature needing attention can be accepted");
    }
    const now = nowIso();
    feature.status = "completed";
    feature.acceptedAt = now;
    feature.completedAt = now;
    feature.updatedAt = now;
    milestone.updatedAt = now;
    await this.persistMilestone(milestone);
    return structuredClone(milestone);
  }

  async finalizeMilestone(
    projectPath: ProjectPath,
    milestoneId: string,
  ): Promise<Milestone> {
    const milestone = this.requireMilestone(projectPath.id, milestoneId);
    const unfinished = milestone.features.filter(
      (feature) => feature.status !== "completed",
    );
    if (unfinished.length > 0) {
      throw new Error(
        `Milestone has ${unfinished.length} unfinished feature${unfinished.length === 1 ? "" : "s"}`,
      );
    }
    const now = nowIso();
    milestone.status = "completed";
    milestone.completedAt = now;
    milestone.updatedAt = now;
    await this.persistMilestone(milestone);
    await persistMilestoneSummary(
      projectPath,
      milestone,
      this.runs().allRuns(),
    );
    return structuredClone(milestone);
  }

  async startNextMilestoneRun(
    projectPath: ProjectPath,
    milestoneId: string,
    options: Omit<StartRunOptions, "task" | "milestoneId" | "sourceTaskIds"> = {},
  ): Promise<RunState> {
    const milestone = this.requireMilestone(projectPath.id, milestoneId);
    if (milestone.status !== "active") {
      throw new Error(`Milestone is ${milestone.status}`);
    }
    if (milestone.features.some((feature) => feature.status === "in_progress")) {
      throw new Error("Milestone already has a feature run in progress");
    }
    const feature = requestedMilestoneFeature(milestone, options.featureId);
    if (!feature) {
      throw new Error(
        options.featureId
          ? `Milestone has no ready feature "${options.featureId}"`
          : "Milestone has no ready feature",
      );
    }
    const task = [
      `Milestone: ${milestone.name}`,
      milestone.goal ? `Milestone goal: ${milestone.goal}` : undefined,
      `Feature: ${feature.title}`,
      feature.description,
      feature.acceptanceCriteria.length > 0
        ? `Acceptance criteria:\n${feature.acceptanceCriteria.map((item) => `- ${item}`).join("\n")}`
        : undefined,
      feature.taskIds.length > 0
        ? `Source tasks: ${feature.taskIds.join(", ")}`
        : undefined,
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n\n");
    return this.runs().startRun(projectPath, "full-delivery", {
      ...options,
      task,
      milestoneId: milestone.id,
      featureId: feature.id,
      sourceTaskIds: feature.taskIds,
    });
  }

  private async startPlanningTurn(
    projectPath: ProjectPath,
    milestoneId: string,
    userContext: string,
    options: Omit<StartRunOptions, "task" | "milestoneId" | "featureId">,
  ): Promise<RunState> {
    const boardContext = await taskBoardFor(projectPath).planningContext();
    const storedCloseoutContext = await milestoneCloseoutContext(projectPath);
    const priorKnowledge = [...this.milestones.values()]
      .filter(
        (milestone) =>
          milestone.projectId === projectPath.id &&
          milestone.id !== milestoneId &&
          (milestone.features.some((feature) => feature.findings.length > 0) ||
            milestone.status === "completed"),
      )
      .map((milestone) => ({
        name: milestone.name,
        findings: milestone.features.flatMap((feature) =>
          feature.findings.map((finding) => finding.title),
        ),
      }));
    const task = renderMilestonePlanningContext(
      userContext,
      boardContext,
      storedCloseoutContext,
      priorKnowledge,
    );
    return this.runs().startRun(projectPath, "milestone-planning", {
      ...options,
      task,
      milestoneId,
    });
  }

  requireMilestone(projectId: string, milestoneId: string): Milestone {
    const milestone = this.milestones.get(milestoneId);
    if (!milestone || milestone.projectId !== projectId) {
      throw new Error(`Milestone not found: ${milestoneId}`);
    }
    return milestone;
  }

  requireMilestoneFeature(
    milestone: Milestone,
    featureId: string,
  ): MilestoneFeature {
    const feature = milestone.features.find(
      (candidate) => candidate.id === featureId,
    );
    if (!feature) {
      throw new Error(`Feature not found: ${featureId}`);
    }
    return feature;
  }

  async completeMilestoneRun(run: RunState): Promise<void> {
    if (
      !run.milestoneId ||
      !run.featureId ||
      this.completingMilestoneRuns.has(run.id)
    ) {
      return;
    }
    this.completingMilestoneRuns.add(run.id);
    try {
      const milestone = this.milestones.get(run.milestoneId);
      const feature = milestone?.features.find(
        (candidate) => candidate.id === run.featureId,
      );
      if (!milestone || !feature) {
        return;
      }
      const now = nowIso();
      feature.status =
        run.status === "completed" ? "completed" : "needs_attention";
      const findings = run.closeout?.report.findings;
      if (findings) {
        feature.findings = findings.map((finding) => ({
          ...finding,
          sourceRunId: run.id,
        }));
      }
      feature.updatedAt = now;
      if (feature.status === "completed") {
        feature.completedAt = now;
      } else {
        delete feature.completedAt;
      }
      milestone.updatedAt = now;
      await this.persistMilestone(milestone);
    } finally {
      this.completingMilestoneRuns.delete(run.id);
    }
  }

  async recordPlanningRun(milestone: Milestone, runId: string): Promise<void> {
    milestone.planningRunIds.push(runId);
    milestone.updatedAt = nowIso();
    await this.persistMilestone(milestone);
  }

  async recordFeatureRun(
    milestone: Milestone,
    feature: MilestoneFeature,
    runId: string,
  ): Promise<void> {
    feature.status = "in_progress";
    feature.runIds.push(runId);
    feature.updatedAt = nowIso();
    milestone.updatedAt = feature.updatedAt;
    await this.persistMilestone(milestone);
  }

  private newMilestoneFeature(
    input: CreateMilestoneFeatureInput,
    now: string,
  ): MilestoneFeature {
    const title = input.title.trim();
    if (!title) {
      throw new Error("Feature title is required");
    }
    return {
      id: randomUUID().slice(0, 8),
      title,
      description: input.description?.trim() || undefined,
      acceptanceCriteria: this.cleanStrings(input.acceptanceCriteria ?? []),
      status: "ready",
      taskIds: this.cleanStrings(input.taskIds ?? []),
      runIds: [],
      findings: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  private cleanStrings(values: string[]): string[] {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  }

  private persistMilestone(milestone: Milestone): Promise<void> {
    return this.milestoneRepositoryFor(
      this.registry.resolve(milestone.projectId),
    ).write(milestone);
  }

  private milestoneRepositoryFor(
    projectPath: ProjectPath,
  ): MilestoneRepository {
    return getOrCreate(
      this.milestoneRepositories,
      projectPath.id,
      () => new MilestoneRepository(projectPath),
    );
  }
}
