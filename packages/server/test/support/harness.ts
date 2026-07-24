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
import { createApp } from "../../src/app.ts";
import { resetEngineAdapters, setEngineAdapter } from "../../src/engines/registry.ts";
import { ProjectRegistry } from "../../src/services/project-registry.ts";
import { RunOrchestrator } from "../../src/services/run-orchestrator.ts";
import { SettingsStore } from "../../src/services/settings-store.ts";
import { FakeEngine } from "./fake-engine.ts";

/** How long a `waitFor*` helper keeps polling before failing the test. */
const WAIT_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 10;

export interface TestApp {
  app: Hono;
  orchestrator: RunOrchestrator;
  registry: ProjectRegistry;
  settings: SettingsStore;
  /** The substituted adapter. Script it in the Anticipate block. */
  engine: FakeEngine;
  /** Temp `ADHD_HOME` for this test — the home project's data root. */
  home: string;
  /** Temp `ADHD_USER_HOME` — the project registry and credentials land here. */
  userHome: string;
  dispose(): Promise<void>;
}

export interface TestAppOptions {
  /** Engine the fake adapter stands in for. Defaults to claude-code. */
  engineId?: EngineId;
}

/**
 * Build an isolated app. Every test gets a fresh orchestrator (so run numbers
 * and in-memory state never leak) and fresh data roots — both the home
 * project's `.adhd` and the user-level registry — so nothing touches the
 * developer's real files.
 */
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
  const app = createApp({ orchestrator, registry, settings });

  return {
    app,
    orchestrator,
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

/** A second orchestrator over the same data roots — a server restart. */
export async function restartApp(): Promise<{ app: Hono; orchestrator: RunOrchestrator }> {
  const registry = new ProjectRegistry();
  const settings = new SettingsStore();
  const orchestrator = new RunOrchestrator({ registry, settings });
  await orchestrator.init();
  return { app: createApp({ orchestrator, registry, settings }), orchestrator };
}

/** Register a temp directory as a project and return it with its API header. */
export async function addTestProject(
  registry: ProjectRegistry,
  label: string,
): Promise<{ id: string; root: string; headers: Record<string, string> }> {
  const root = await mkdtemp(path.join(os.tmpdir(), `adhd-${label}-`));
  const project = await registry.add(root);
  return { id: project.id, root, headers: { "X-ADHD-Project": project.id } };
}

/** Extra request headers — in practice `X-ADHD-Project` to target a project. */
export type TestHeaders = Record<string, string>;

const JSON_HEADERS: TestHeaders = { "Content-Type": "application/json" };

/** POST JSON and return the parsed body plus status. */
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

/** PUT JSON and return the parsed body plus status. */
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

/** GET JSON and return the parsed body plus status. */
export async function get<T>(
  app: Hono,
  route: string,
  headers: TestHeaders = {},
): Promise<{ status: number; body: T }> {
  const response = await app.request(route, { headers });
  return { status: response.status, body: (await response.json()) as T };
}

/** DELETE and return the parsed body plus status. */
export async function del<T>(
  app: Hono,
  route: string,
  headers: TestHeaders = {},
): Promise<{ status: number; body: T }> {
  const response = await app.request(route, { method: "DELETE", headers });
  return { status: response.status, body: (await response.json()) as T };
}

/** Start a run through the API and return its created state. */
export async function startRun(
  app: Hono,
  body: Record<string, unknown>,
  headers: TestHeaders = {},
): Promise<RunState> {
  const { status, body: run } = await post<RunState>(app, "/runs", body, headers);
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
