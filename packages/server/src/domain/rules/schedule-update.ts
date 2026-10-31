import type { Schedule, UpdateScheduleInput } from "@isotopy/core";

export function mergeScheduleUpdate(
  current: Schedule,
  patch: UpdateScheduleInput,
  updatedAt: string,
): Schedule {
  const { flow, ...fields } = patch;
  return {
    ...current,
    ...fields,
    flow: flow === null ? undefined : (flow ?? current.flow),
    updatedAt,
  };
}
