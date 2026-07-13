import type { RunEvent, RunState } from "@adhd/core";
import { RUN_EVENT_TYPES } from "@adhd/core";

const API_BASE = "";

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init);
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed: ${path}`);
  }
  return response.json() as Promise<T>;
}

function postJson<T>(path: string, body?: unknown): Promise<T> {
  return requestJson<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function fetchRuns(): Promise<RunState[]> {
  return requestJson<RunState[]>("/runs");
}

export function fetchRun(runId: string): Promise<RunState> {
  return requestJson<RunState>(`/runs/${runId}`);
}

export interface StartRunOptions {
  pipelineId?: string;
  task?: string;
  disabledStages?: string[];
  failProbability?: number;
}

export function startRun(options: StartRunOptions = {}): Promise<RunState> {
  return postJson<RunState>("/runs", { pipelineId: "sequential", ...options });
}

export function approveGate(runId: string, stageId: string): Promise<RunState> {
  return postJson<RunState>(`/runs/${runId}/gates/${stageId}/approve`);
}

export function abortRun(runId: string): Promise<RunState> {
  return postJson<RunState>(`/runs/${runId}/abort`);
}

export function restartRun(runId: string, stageId: string): Promise<RunState> {
  return postJson<RunState>(`/runs/${runId}/restart`, { stageId });
}

export function subscribeRunEvents(
  runId: string,
  onEvent: (event: RunEvent) => void,
): () => void {
  const source = new EventSource(`${API_BASE}/runs/${runId}/events`);

  for (const type of RUN_EVENT_TYPES) {
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
