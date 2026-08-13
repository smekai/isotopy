import { agentForStage } from "@isotopy/core";
import type { RunState, StageDefinition } from "@isotopy/core";
import { extractReleaseManifest } from "../../schemas/release-manifest.ts";
import { formatValidationIssues } from "../../domain/validation.ts";
import { nowIso } from "../../utils/time.ts";
import { persistReleaseArtifacts } from "../run-evidence.ts";
import type { ProjectRegistry } from "../project-registry.ts";
import type { StageOutputRejection } from "../../domain/rules/stage-context.ts";
import type { StageOutputConsumer } from "./stage-output-consumer.ts";

export class ReleaseConsumer implements StageOutputConsumer {
  constructor(private readonly registry: ProjectRegistry) {}

  async consume(
    run: RunState,
    stageDef: StageDefinition,
    output: string,
  ): Promise<StageOutputRejection | undefined> {
    if (stageDef.stepTask !== RELEASE_STEP_TASK) {
      return undefined;
    }
    const parsed = extractReleaseManifest(output);
    if (!parsed.ok) {
      return {
        reason: `${agentForStage(stageDef).profession} produced no usable release handoff — ${formatValidationIssues(parsed.issues)}`,
      };
    }
    run.release = { manifest: parsed.value, completedAt: nowIso() };
    await persistReleaseArtifacts(
      this.registry.resolve(run.projectId),
      run.id,
      run.release,
    );
    return undefined;
  }
}

const RELEASE_STEP_TASK = "prepare-release";
