// Component-test harness: a real Hono app over a real orchestrator, with the
// two external dependencies substituted — the engine adapter and the `.adhd`
// data root.
//
// AAAAA forbids branching or inline logic in a test body, so every loop, poll
// and retry in a component test lives here instead.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Hono } from "hono";
import type { EngineId, RunState } from "@adhd/core";
import { createApp } from "../../src/app.js";
import { resetEngineAdapters, setEngineAdapter } from "../../src/engines/registry.js";
import { RunOrchestrator } from "../../src/services/run-orchestrator.js";
import { FakeEngine } from "./fake-engine.js";

/** How long a `waitFor*` helper keeps polling before failing the test. */
const WAIT_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 10;

export interface TestApp {
  app: Hono;
  orchestrator: RunOrchestrator;
  /** The substituted adapter. Script it in the Anticipate block. */
  engine: FakeEngine;
  /** Temp `ADHD_HOME` for this test — runs, settings and personas all land here. */
  home: string;
  dispose(): Promise<void>;
}

export interface TestAppOptions {
  /** Engine the fake adapter stands in for. Defaults to claude-code. */
  engineId?: EngineId;
}

/**
 * Build an isolated app. Every test gets a fresh orchestrator (so run numbers
 * and in-memory state never leak) and a fresh data root (so nothing touches the
 * developer's real `.adhd/runs`).
 */
export async function createTestApp(options: TestAppOptions = {}): Promise<TestApp> {
  const engineId = options.engineId ?? "claude-code";
  const home = await mkdtemp(path.join(os.tmpdir(), "adhd-comp-"));
  process.env.ADHD_HOME = home;

  const engine = new FakeEngine(engineId);
  setEngineAdapter(engineId, engine);

  const orchestrator = new RunOrchestrator();
  const app = createApp({ orchestrator });

  return {
    app,
    orchestrator,
    engine,
    home,
    dispose: async () => {
      // Order matters: stop the orchestrator (which cancels in-flight runs and
      // waits for queued writes) before removing the directory those writes
      // target, or Windows fails the delete with EBUSY.
      await orchestrator.shutdown();
      resetEngineAdapters();
      delete process.env.ADHD_HOME;
      // maxRetries covers the Windows case where a handle is still closing.
      // A temp directory that survives is untidy, never a test failure.
      await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
        .catch(() => undefined);
    },
  };
}

/** POST JSON and return the parsed body plus status. */
export async function post<T>(
  app: Hono,
  route: string,
  body?: unknown,
): Promise<{ status: number; body: T }> {
  const response = await app.request(route, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: (await response.json()) as T };
}

/** PUT JSON and return the parsed body plus status. */
export async function put<T>(
  app: Hono,
  route: string,
  body: unknown,
): Promise<{ status: number; body: T }> {
  const response = await app.request(route, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as T };
}

/** GET JSON and return the parsed body plus status. */
export async function get<T>(
  app: Hono,
  route: string,
): Promise<{ status: number; body: T }> {
  const response = await app.request(route);
  return { status: response.status, body: (await response.json()) as T };
}

/** Start a run through the API and return its created state. */
export async function startRun(
  app: Hono,
  body: Record<string, unknown>,
): Promise<RunState> {
  const { status, body: run } = await post<RunState>(app, "/runs", body);
  if (status !== 201) {
    throw new Error(`Expected 201 from POST /runs, got ${status}: ${JSON.stringify(run)}`);
  }
  return run;
}

/** Current server-side state of a run. */
export async function getRun(app: Hono, runId: string): Promise<RunState> {
  const { body } = await get<RunState>(app, `/runs/${runId}`);
  return body;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll until `predicate` holds, then return the run. Throws with the run's last
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
  if (!predicate(last)) {
    throw new Error(
      `Timed out waiting for ${description}. Run was: ${JSON.stringify(last, null, 2)}`,
    );
  }
  return last;
}

/** Wait for the run itself to reach a status. */
export function waitForRunStatus(
  app: Hono,
  runId: string,
  status: RunState["status"],
): Promise<RunState> {
  return waitForRun(app, runId, (run) => run.status === status, `run status "${status}"`);
}

/** Wait for one stage to reach a status — e.g. the box that must run first. */
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

/** The stage entry from a run, for assertions. */
export function stageOf(run: RunState, stageId: string) {
  const stage = run.stages.find((item) => item.id === stageId);
  if (!stage) {
    throw new Error(`Run has no stage "${stageId}"`);
  }
  return stage;
}

/**
 * Simulated stage timing for tests: fast enough to be free, non-zero so the
 * stage still passes through every state a real one does. `failProbability: 0`
 * removes the orchestrator's 5% random failure, which would flake the suite.
 */
export const FAST_SIM = {
  minDurationMs: 40,
  maxDurationMs: 40,
  failProbability: 0,
} as const;
