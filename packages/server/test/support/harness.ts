// AAAAA forbids branching or inline logic in a test body, so every loop, poll
// and retry in a component test lives here instead.
import { assert, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Hono } from "hono";
import { RUN_SUMMARY_EVENT } from "@adhd/core";
import type { EngineId, RunEvent, RunState, RunSummary } from "@adhd/core";
import { createApp } from "../../src/app.ts";
import { resetEngineAdapters, setEngineAdapter } from "../../src/engines/registry.ts";
import { OrchestrationService } from "../../src/services/orchestration.ts";
import { ProjectRegistry } from "../../src/services/project-registry.ts";
import { RunOrchestrator } from "../../src/services/run-orchestrator.ts";
import { SettingsStore } from "../../src/services/settings-store.ts";
import { FakeEngine } from "./fake-engine.ts";

const WAIT_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 10;

export interface TestApp {
  app: Hono;
  orchestrator: RunOrchestrator;
  orchestrations: OrchestrationService;
  registry: ProjectRegistry;
  settings: SettingsStore;
  engine: FakeEngine;
  /** Temp `ADHD_HOME` for this test — the home project's data root. */
  home: string;
  /** Temp `ADHD_USER_HOME` — the project registry and credentials land here. */
  userHome: string;
  dispose(): Promise<void>;
}

export interface TestAppOptions {
  engineId?: EngineId;
}

export async function createTestApp(options: TestAppOptions = {}): Promise<TestApp> {
  const engineId = options.engineId ?? "claude-code";
  const home = await mkdtemp(path.join(os.tmpdir(), "adhd-comp-"));
  const userHome = await mkdtemp(path.join(os.tmpdir(), "adhd-user-"));
  process.env.ADHD_HOME = home;
  process.env.ADHD_USER_HOME = userHome;

  const engine = new FakeEngine(engineId);
  setEngineAdapter(engineId, engine);

  const registry = new ProjectRegistry();
  const settings = new SettingsStore();
  const orchestrator = new RunOrchestrator({ registry, settings });
  const orchestrations = new OrchestrationService({ registry, runs: orchestrator });
  orchestrator.registerStageOutputConsumer(orchestrations);
  orchestrator.registerQuestionMediator(orchestrations);
  orchestrator.registerRunReviewer(orchestrations);
  await orchestrations.init();
  const app = createApp({ orchestrator, orchestrations, registry, settings });

  return {
    app,
    orchestrator,
    orchestrations,
    registry,
    settings,
    engine,
    home,
    userHome,
    dispose: async () => {
      // Order matters: stop the orchestrator (which cancels in-flight runs and
      // waits for queued writes) before removing the directory those writes
      // target, or Windows fails the delete with EBUSY.
      await orchestrator.shutdown();
      await orchestrations.shutdown();
      resetEngineAdapters();
      delete process.env.ADHD_HOME;
      delete process.env.ADHD_USER_HOME;
      // maxRetries covers the Windows case where a handle is still closing.
      // A temp directory that survives is untidy, never a test failure.
      await Promise.all(
        [home, userHome].map((dir) =>
          rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(
            () => undefined,
          ),
        ),
      );
    },
  };
}

export interface RestartedApp {
  app: Hono;
  orchestrator: RunOrchestrator;
  orchestrations: OrchestrationService;
  /**
   * Settles every service this rebooted app opened. Each one holds its own
   * SQLite connection to the project's `runs.db`, and on Windows a connection
   * left open blocks the temp-directory delete in `dispose()`. Always prefer
   * this over shutting a single service down by hand — a service added here
   * later is then torn down without revisiting fourteen call sites.
   */
  shutdown(): Promise<void>;
}

export async function restartApp(): Promise<RestartedApp> {
  const registry = new ProjectRegistry();
  const settings = new SettingsStore();
  const orchestrator = new RunOrchestrator({ registry, settings });
  const orchestrations = new OrchestrationService({ registry, runs: orchestrator });
  orchestrator.registerStageOutputConsumer(orchestrations);
  orchestrator.registerQuestionMediator(orchestrations);
  orchestrator.registerRunReviewer(orchestrations);
  await orchestrations.init();
  await orchestrator.init();
  return {
    app: createApp({ orchestrator, orchestrations, registry, settings }),
    orchestrator,
    orchestrations,
    shutdown: async () => {
      await orchestrator.shutdown();
      await orchestrations.shutdown();
    },
  };
}

export async function addTestProject(
  registry: ProjectRegistry,
  label: string,
): Promise<{ id: string; root: string; headers: Record<string, string> }> {
  const root = await mkdtemp(path.join(os.tmpdir(), `adhd-${label}-`));
  const project = await registry.add(root);
  return { id: project.id, root, headers: { "X-ADHD-Project": project.id } };
}

export type TestHeaders = Record<string, string>;

const JSON_HEADERS: TestHeaders = { "Content-Type": "application/json" };

export async function post<T>(
  app: Hono,
  route: string,
  body?: unknown,
  headers: TestHeaders = {},
): Promise<{ status: number; body: T }> {
  const response = await app.request(route, {
    method: "POST",
    headers: { ...JSON_HEADERS, ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: (await response.json()) as T };
}

export async function put<T>(
  app: Hono,
  route: string,
  body: unknown,
  headers: TestHeaders = {},
): Promise<{ status: number; body: T }> {
  const response = await app.request(route, {
    method: "PUT",
    headers: { ...JSON_HEADERS, ...headers },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as T };
}

export async function patch<T>(
  app: Hono,
  route: string,
  body: unknown,
  headers: TestHeaders = {},
): Promise<{ status: number; body: T }> {
  const response = await app.request(route, {
    method: "PATCH",
    headers: { ...JSON_HEADERS, ...headers },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as T };
}

export async function get<T>(
  app: Hono,
  route: string,
  headers: TestHeaders = {},
): Promise<{ status: number; body: T }> {
  const response = await app.request(route, { headers });
  return { status: response.status, body: (await response.json()) as T };
}

export async function del<T>(
  app: Hono,
  route: string,
  headers: TestHeaders = {},
): Promise<{ status: number; body: T }> {
  const response = await app.request(route, { method: "DELETE", headers });
  return { status: response.status, body: (await response.json()) as T };
}

export async function startRun(
  app: Hono,
  body: Record<string, unknown>,
  headers: TestHeaders = {},
): Promise<RunState> {
  const { status, body: run } = await post<RunState>(app, "/runs", body, headers);
  expect(status, `POST /runs returned ${JSON.stringify(run)}`).toBe(201);
  return run;
}

export async function getRun(app: Hono, runId: string): Promise<RunState> {
  const { body } = await get<RunState>(app, `/runs/${runId}`);
  return body;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll until `predicate` holds, then return the run. Fails with the run's last
 * known state on timeout, which is what makes a failure diagnosable.
 */
export async function waitForRun(
  app: Hono,
  runId: string,
  predicate: (run: RunState) => boolean,
  description: string,
): Promise<RunState> {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  let last = await getRun(app, runId);
  while (!predicate(last) && Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    last = await getRun(app, runId);
  }
  assert(
    predicate(last),
    `Timed out waiting for ${description}. Run was: ${JSON.stringify(last, null, 2)}`,
  );
  return last;
}

export function waitForRunStatus(
  app: Hono,
  runId: string,
  status: RunState["status"],
): Promise<RunState> {
  return waitForRun(app, runId, (run) => run.status === status, `run status "${status}"`);
}

export function waitForStageStatus(
  app: Hono,
  runId: string,
  stageId: string,
  status: string,
): Promise<RunState> {
  return waitForRun(
    app,
    runId,
    (run) => run.stages.find((stage) => stage.id === stageId)?.status === status,
    `stage "${stageId}" to be "${status}"`,
  );
}

export interface SseEvent {
  event: string;
  data: string;
}

export interface SseCollector {
  waitFor(
    predicate: (events: SseEvent[]) => boolean,
    description: string,
  ): Promise<SseEvent[]>;
  close(): Promise<void>;
}

function parseSseFrame(frame: string): SseEvent {
  let event = "message";
  const data: string[] = [];
  for (const line of frame.split(/\r?\n/)) {
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      data.push(line.slice("data:".length).trim());
    }
  }
  return { event, data: data.join("\n") };
}

export async function openSse(
  app: Hono,
  route: string,
  headers: TestHeaders = {},
): Promise<SseCollector> {
  const response = await app.request(route, { headers });
  assert(response.body, `No SSE body from ${route}`);

  const events: SseEvent[] = [];
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const pump = (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        return;
      }
      buffer += decoder.decode(value, { stream: true });
      let split = buffer.indexOf("\n\n");
      while (split !== -1) {
        events.push(parseSseFrame(buffer.slice(0, split)));
        buffer = buffer.slice(split + 2);
        split = buffer.indexOf("\n\n");
      }
    }
  })().catch(() => undefined);

  return {
    async waitFor(predicate, description) {
      const deadline = Date.now() + WAIT_TIMEOUT_MS;
      while (!predicate(events) && Date.now() < deadline) {
        await sleep(POLL_INTERVAL_MS);
      }
      assert(
        predicate(events),
        `Timed out waiting for ${description}. Saw: ${JSON.stringify(events, null, 2)}`,
      );
      return [...events];
    },
    async close() {
      await reader.cancel().catch(() => undefined);
      await pump;
    },
  };
}

export function summariesOf(events: SseEvent[]): RunSummary[] {
  return events
    .filter((event) => event.event === RUN_SUMMARY_EVENT)
    .map((event) => JSON.parse(event.data) as RunSummary);
}

/**
 * The first event of a type, narrowed to its variant. Replay overlap means the
 * stream may carry the same event twice; a test asking for one wants the first.
 */
export function runEventOf<T extends RunEvent["type"]>(
  events: SseEvent[],
  type: T,
): Extract<RunEvent, { type: T }> {
  const match = events
    .filter((event) => event.event === type)
    .map((event) => JSON.parse(event.data) as RunEvent)
    .find((event): event is Extract<RunEvent, { type: T }> => event.type === type);
  const seen = events.map((event) => event.event).join(", ");
  assert(match, `No "${type}" event in the stream. Saw: ${seen || "nothing"}`);
  return match;
}

/**
 * Wait for the Project Manager's gate and approve it. Every `pm-dev-test` run
 * parks there before the Developer starts, so a test about the Developer→Tester
 * handoff has to get past it first.
 */
export async function approveIntake(app: Hono, runId: string): Promise<void> {
  await waitForStageStatus(app, runId, "intake", "awaiting");
  const { status } = await post(app, `/runs/${runId}/gates/intake/approve`);
  expect(status, "approving the intake gate").toBe(200);
}

export function stageOf(run: RunState, stageId: string) {
  const stage = run.stages.find((item) => item.id === stageId);
  assert(stage, `Run has no stage "${stageId}"`);
  return stage;
}

/**
 * Table names in one of a project's SQLite files. Read-only and opened fresh, so
 * it never competes with the connections the app holds — which is the whole
 * point of the file the caller is usually asking about.
 */
export function tablesIn(projectRoot: string, file: string): string[] {
  const connection = new DatabaseSync(path.join(projectRoot, ".adhd", file), {
    readOnly: true,
  });
  try {
    return connection
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((row) => String(row.name));
  } finally {
    connection.close();
  }
}
