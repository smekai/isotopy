import type { RunState, StageDefinition } from "@adhd/core";
import type { ProjectRegistry } from "../project-registry.ts";
import { applyProductManagerCloseout } from "../product-manager-closeout.ts";
import type { StageOutputConsumer } from "./stage-output-consumer.ts";

export class CloseoutConsumer implements StageOutputConsumer {
  constructor(private readonly registry: ProjectRegistry) {}

  async consume(
    run: RunState,
    stageDef: StageDefinition,
    output: string,
  ): Promise<void> {
    if (run.pipelineId !== PIPELINE_ID || stageDef.id !== STAGE_ID) {
      return;
    }
    run.closeout = await applyProductManagerCloseout(
      this.registry.resolve(run.projectId),
      run,
      output,
    );
  }
}

const PIPELINE_ID = "full-delivery";

const STAGE_ID = "closeout";
