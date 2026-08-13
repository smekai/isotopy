import type { RunState, StageDefinition } from "@isotopy/core";
import type { StageOutputRejection } from "../../domain/rules/stage-context.ts";

export interface StageOutputConsumer {
  consume(
    run: RunState,
    stageDef: StageDefinition,
    output: string,
  ): Promise<StageOutputRejection | undefined>;
}

export async function firstRejectionFrom(
  consumers: readonly StageOutputConsumer[],
  run: RunState,
  stageDef: StageDefinition,
  output: string,
): Promise<StageOutputRejection | undefined> {
  let rejection: StageOutputRejection | undefined;
  for (const consumer of consumers) {
    const rejected = await consumer.consume(run, stageDef, output);
    rejection ??= rejected;
  }
  return rejection;
}
