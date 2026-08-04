import type { RunEvent, RunState, StageEvent } from "@adhd/core";

export function applyEvent(run: RunState, event: RunEvent): RunState {
  const next = structuredClone(run);

  switch (event.type) {
    case "run.started":
      next.status = "running";
      delete next.completedAt;
      return next;

    case "run.completed":
      next.status = event.status;
      next.completedAt = event.ts;
      if (event.result !== undefined) {
        next.result = event.result;
      }
      return next;

    case "run.message": {
      const message = event.chatMessage;
      if (!next.messages.some((entry) => entry.id === message.id)) {
        next.messages.push(message);
      }
      return next;
    }

    default:
      return applyStageEvent(next, event);
  }
}

function applyStageEvent(next: RunState, event: StageEvent): RunState {
  const stage = next.stages.find((item) => item.id === event.stageId);
  if (!stage) {
    return next;
  }

  switch (event.type) {
    case "stage.started":
      stage.status = "running";
      stage.startedAt = event.ts;
      delete stage.completedAt;
      return next;

    // The snapshot and the live stream overlap while a reader is catching up,
    // so the same log can arrive twice.
    case "stage.log": {
      const duplicate = stage.logs.some(
        (entry) => entry.ts === event.ts && entry.message === event.message,
      );
      if (!duplicate) {
        stage.logs.push({
          ts: event.ts,
          level: event.level,
          message: event.message,
        });
      }
      return next;
    }

    case "stage.usage":
      stage.usage = event.usage;
      return next;

    case "stage.completed":
      stage.status = "passed";
      stage.completedAt = event.ts;
      return next;

    case "stage.failed":
      stage.status = "failed";
      stage.completedAt = event.ts;
      return next;

    case "stage.awaiting":
      stage.status = "awaiting";
      next.status = "awaiting";
      return next;

    case "stage.asking":
      stage.status = "asking";
      next.status = "asking";
      return next;

    case "stage.answered":
      stage.status = "running";
      next.status = "running";
      return next;

    case "stage.blocked":
      stage.status = "blocked";
      next.status = "blocked";
      next.limit = event.limit;
      return next;

    case "stage.unblocked":
      stage.status = "running";
      next.status = "running";
      delete next.limit;
      return next;

    case "stage.approved":
      stage.status = "passed";
      stage.completedAt = event.ts;
      next.status = "running";
      return next;

    case "stage.skipped":
      stage.status = "skipped";
      stage.completedAt = event.ts;
      return next;

    default: {
      const unhandled: never = event;
      return unhandled;
    }
  }
}
