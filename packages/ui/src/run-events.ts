import type { RunEvent, RunState } from "@adhd/core";

export function applyEvent(run: RunState, event: RunEvent): RunState {
  const next = structuredClone(run);

  if (event.type === "run.started") {
    next.status = "running";
    delete next.completedAt;
  }

  if (event.type === "run.completed") {
    next.status =
      event.status === "failed" || event.status === "cancelled"
        ? event.status
        : "completed";
    next.completedAt = event.ts;
    if (event.result !== undefined) {
      next.result = event.result;
    }
  }

  if (event.type === "run.message" && event.chatMessage) {
    const message = event.chatMessage;
    if (!next.messages.some((entry) => entry.id === message.id)) {
      next.messages.push(message);
    }
    return next;
  }

  if (!event.stageId) {
    return next;
  }

  const stage = next.stages.find((item) => item.id === event.stageId);
  if (!stage) {
    return next;
  }

  if (event.type === "stage.started") {
    stage.status = "running";
    stage.startedAt = event.ts;
    delete stage.completedAt;
  }

  if (event.type === "stage.log" && event.message) {
    const duplicate = stage.logs.some(
      (entry) => entry.ts === event.ts && entry.message === event.message,
    );
    if (!duplicate) {
      stage.logs.push({
        ts: event.ts,
        level: event.level ?? "info",
        message: event.message,
      });
    }
  }

  if (event.type === "stage.usage" && event.usage) {
    stage.usage = event.usage;
  }

  if (event.type === "stage.completed") {
    stage.status = "passed";
    stage.completedAt = event.ts;
  }

  if (event.type === "stage.failed") {
    stage.status = "failed";
    stage.completedAt = event.ts;
  }

  if (event.type === "stage.awaiting") {
    stage.status = "awaiting";
    next.status = "awaiting";
  }

  if (event.type === "stage.asking") {
    stage.status = "asking";
    next.status = "asking";
  }

  if (event.type === "stage.answered") {
    stage.status = "running";
    next.status = "running";
  }

  if (event.type === "stage.approved") {
    stage.status = "passed";
    stage.completedAt = event.ts;
    next.status = "running";
  }

  if (event.type === "stage.skipped") {
    stage.status = "skipped";
  }

  return next;
}
