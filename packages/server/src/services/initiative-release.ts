import { RELEASE_PIPELINE, isReleaseRun, isTeamRun } from "@isotopy/core";
import type { Orchestration, RunState, StopDecision } from "@isotopy/core";
import { NOTHING_TO_MERGE } from "../domain/rules/initiative-branch.ts";
import {
  RELEASE_NEEDS_FIX,
  localMergeNotice,
  releasedStopReason,
} from "../domain/rules/pull-request-release.ts";
import { messageOf } from "../utils/message-of.ts";
import type { Logger } from "../utils/logger.ts";
import type { ReleaseContext } from "../workflow/types.ts";
import type { ProjectRegistry } from "./project-registry.ts";
import type { PullRequestRelease } from "./pull-request-release.ts";
import type { RunService } from "./run/run-service.ts";

export type ReleaseBeginning =
  | { kind: "local" }
  | { kind: "started"; run: RunState }
  | { kind: "refused"; refusal: string };

export class InitiativeRelease {
  private readonly logger: Logger;

  constructor(
    private readonly registry: ProjectRegistry,
    private readonly runs: RunService,
    private readonly release: PullRequestRelease,
    logger: Logger,
  ) {
    this.logger = logger.child("InitiativeRelease");
  }

  async begin(orchestration: Orchestration, completingRunId?: string): Promise<ReleaseBeginning> {
    const projectPath = this.registry.resolve(orchestration.projectId);
    const channel = await this.release.channel(projectPath.root);
    if (channel.kind === "local") {
      this.noteOnRun(completingRunId, localMergeNotice(channel.reason));
      return { kind: "local" };
    }
    const inherited =
      completingRunId === undefined ? {} : this.runs.inheritedRunOptions(completingRunId);
    try {
      const run = await this.runs.startComposedRun(projectPath, RELEASE_PIPELINE, {
        ...inherited,
        task: orchestration.goal,
        orchestrationId: orchestration.id,
      });
      return { kind: "started", run };
    } catch (error) {
      return {
        kind: "refused",
        refusal: `The pull request could not be started: ${messageOf(error)}`,
      };
    }
  }

  contextFor(orchestration: Orchestration): ReleaseContext {
    const delivered = this.latestTeamRun(orchestration, (run) => run.closeout !== undefined);
    const decision = orchestration.latestDecision;
    return {
      goal: orchestration.goal,
      summary: decision?.action === "stop" ? decision.summary : undefined,
      closeout: delivered?.closeout?.report,
    };
  }

  stopReason(orchestration: Orchestration, released: RunState): string {
    const decision = orchestration.latestDecision;
    const reason = decision?.action === "stop" ? decision.reason : "Released";
    const url = released.pullRequest?.url;
    return orchestration.branch === undefined || url === undefined
      ? reason
      : releasedStopReason(reason, orchestration.branch, url);
  }

  mergeRefusal(
    orchestration: Orchestration,
    settled: RunState,
    decision: StopDecision,
  ): string | undefined {
    if (decision.merge !== true) {
      return undefined;
    }
    if (orchestration.branch === undefined) {
      return NOTHING_TO_MERGE;
    }
    return isReleaseRun(settled) && settled.pullRequest?.ci === "failed"
      ? RELEASE_NEEDS_FIX
      : undefined;
  }

  seedSource(orchestration: Orchestration, settled: RunState): RunState {
    return isTeamRun(settled) ? settled : (this.latestTeamRun(orchestration) ?? settled);
  }

  private latestTeamRun(
    orchestration: Orchestration,
    accepts: (run: RunState) => boolean = () => true,
  ): RunState | undefined {
    return [...orchestration.runIds]
      .reverse()
      .map((runId) => this.runs.getRun(runId))
      .find(
        (candidate): candidate is RunState =>
          candidate !== undefined && isTeamRun(candidate) && accepts(candidate),
      );
  }

  private noteOnRun(runId: string | undefined, message: string): void {
    const stageId = runId === undefined ? undefined : this.runs.getRun(runId)?.stages.at(-1)?.id;
    if (runId !== undefined && stageId !== undefined) {
      this.runs.log(runId, stageId, { level: "warn", message });
    }
    this.logger.info(message, { runId });
  }
}
