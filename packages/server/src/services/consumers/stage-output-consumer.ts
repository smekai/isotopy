import type { RunState, StageDefinition } from "@adhd/core";

export interface StageOutputRejection {
  reason: string;
}

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
