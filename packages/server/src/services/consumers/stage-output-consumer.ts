import type { RunState, StageDefinition } from "@adhd/core";

export interface StageOutputConsumer {
  consume(run: RunState, stageDef: StageDefinition, output: string): Promise<void>;
}
