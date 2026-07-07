import type { PipelineDefinition, RunEvent, RunState } from "@adhd/core";

const API_BASE = "";

export async function fetchPipelines(): Promise<PipelineDefinition[]> {
  const response = await fetch(`${API_BASE}/pipelines`);
  if (!response.ok) {
    throw new Error("Failed to load pipelines");
  }
  return response.json() as Promise<PipelineDefinition[]>;
}

export async function startRun(pipelineId: string): Promise<RunState> {
  const response = await fetch(`${API_BASE}/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pipelineId }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Failed to start run");
  }
  return response.json() as Promise<RunState>;
}

export async function fetchRun(runId: string): Promise<RunState> {
  const response = await fetch(`${API_BASE}/runs/${runId}`);
  if (!response.ok) {
    throw new Error("Failed to load run");
  }
  return response.json() as Promise<RunState>;
}

export function subscribeRunEvents(
  runId: string,
  onEvent: (event: RunEvent) => void,
): () => void {
  const source = new EventSource(`${API_BASE}/runs/${runId}/events`);

  source.onmessage = (message) => {
    if (!message.data) {
      return;
    }
    try {
      onEvent(JSON.parse(message.data) as RunEvent);
    } catch {
      // ignore malformed events
    }
  };

  for (const type of [
    "run.started",
    "run.completed",
    "stage.started",
    "stage.log",
    "stage.completed",
    "stage.failed",
  ]) {
    source.addEventListener(type, (message) => {
      if (!(message instanceof MessageEvent) || !message.data) {
        return;
      }
      try {
        onEvent(JSON.parse(message.data) as RunEvent);
      } catch {
        // ignore malformed events
      }
    });
  }

  return () => source.close();
}
