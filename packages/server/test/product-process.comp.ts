import { afterEach, beforeEach, expect, test } from "vitest";
import { PROJECT_HEADER } from "@isotopy/core";
import type { ProductProcessStatus, ProjectAutomationConfig, UiAutomation } from "@isotopy/core";
import type { ProductResponseHeaders } from "../src/domain/rules/product-preview.ts";
import type { ProjectPath } from "../src/paths.ts";
import { AutomationConfigStore } from "../src/services/automation-config-store.ts";
import { ProductProcessService } from "../src/services/product-process-service.ts";
import type { ProductProcessDependencies } from "../src/services/product-process-service.ts";
import type { SubprocessHandle, SubprocessResult, SubprocessSpec } from "../src/engines/subprocess.ts";
import { addTestProject, createTestApp, get, post, put } from "./support/harness.ts";
import type { TestApp } from "./support/harness.ts";

const HEALTH_URL = "http://127.0.0.1:59999/";

/** Serialization means a second caller never arrives, so the gate must also open on its own. */
const GATE_FALLBACK_MS = 50;

let ctx: TestApp;

beforeEach(async () => {
  ctx = await createTestApp();
});

afterEach(async () => {
  await ctx.dispose();
});

test("a product that answers its health URL becomes ready and records how it may be framed", async () => {
  // Arrange
  await put<ProjectAutomationConfig>(ctx.app, "/automation", automationConfig());
  const stub = stubProcess();
  const product = new ProductProcessService(new AutomationConfigStore(), {
    ...stub.deps,
    probe: () => Promise.resolve({ ok: true }),
    headers: () => Promise.resolve({ xFrameOptions: "DENY" }),
  });

  // Act
  await product.start(ctx.registry.resolve());

  // Assert
  await product.settle();
  const status = await product.status(ctx.registry.resolve());
  expect(status.state).toBe("ready");
  expect(status.url).toBe(HEALTH_URL);
  expect(status.framing).toEqual({ allowed: false, blockedBy: "X-Frame-Options: DENY" });
  await product.shutdown();
});

test("a rival that loses the port to an already-serving product is adopted, not reported as exited", async () => {
  // Arrange — TASK-142's dogfood: a dev server the Developer stage leaked held
  // 5180, so starting spawned a rival that died with EADDRINUSE. The exit
  // aborted the health poll, and the service reported the product exited while
  // it answered 200 at that very URL for another two hours.
  await put<ProjectAutomationConfig>(ctx.app, "/automation", automationConfig());
  const stub = stubProcess();
  const product = new ProductProcessService(new AutomationConfigStore(), {
    ...stub.deps,
    probe: servingUntilAborted,
  });
  await product.start(ctx.registry.resolve());

  // Act — the rival dies, which aborts the health poll mid-probe; the leftover
  // goes on serving, which is the whole point.
  stub.emitStderr("Error: Port 59999 is already in use");
  stub.exit({ exitCode: 1, errorMessage: "Process exited with code 1" });

  // Assert
  await product.settle();
  const status = await product.status(ctx.registry.resolve());
  expect(status.state).toBe("ready");
  expect(status.adopted).toBe(true);
  expect(status.lastError).toBeUndefined();
  await product.shutdown();
});

test("a rival that dies with nothing serving the URL still reports the exit", async () => {
  // Arrange — the same crash, but the port really is dead. Adoption must not
  // paper over a product that is genuinely not there.
  await put<ProjectAutomationConfig>(ctx.app, "/automation", automationConfig());
  const stub = stubProcess();
  const product = new ProductProcessService(new AutomationConfigStore(), stub.deps);
  await product.start(ctx.registry.resolve());

  // Act
  stub.exit({ exitCode: 1, errorMessage: "Process exited with code 1" });

  // Assert
  await product.settle();
  const status = await product.status(ctx.registry.resolve());
  expect(status.state).toBe("exited");
  expect(status.adopted).toBeUndefined();
  expect(status.lastError).toContain("code 1");
});

test("a product that never answers fails with its own stderr, so the reason is not a bare timeout", async () => {
  // Arrange
  await put<ProjectAutomationConfig>(ctx.app, "/automation", automationConfig());
  const stub = stubProcess();
  const product = new ProductProcessService(new AutomationConfigStore(), stub.deps);

  // Act
  await product.start(ctx.registry.resolve());

  // Assert
  stub.emitStderr("Error: listen EADDRINUSE 127.0.0.1:59999");
  await product.settle();
  const status = await product.status(ctx.registry.resolve());
  expect(status.state).toBe("failed");
  expect(status.lastError).toContain(HEALTH_URL);
  expect(status.lastError).toContain("EADDRINUSE");
  expect(stub.killed()).toBe(true);
});

test("a second start reuses the running product rather than spawning a rival for the same port", async () => {
  // Arrange
  await put<ProjectAutomationConfig>(ctx.app, "/automation", automationConfig());
  const stub = stubProcess();
  const product = new ProductProcessService(new AutomationConfigStore(), {
    ...stub.deps,
    probe: () => Promise.resolve({ ok: true }),
  });
  const project = ctx.registry.resolve();
  await product.start(project);
  await product.settle();

  // Act
  await product.start(project);

  // Assert
  expect(stub.starts()).toBe(1);
  await product.shutdown();
});

test("two starts racing each other spawn one product, not two fighting over the port", async () => {
  // Arrange — the injected QA prompt calls start idempotent, so a second caller
  // arriving while the first is still reading the config must not spawn a rival.
  await put<ProjectAutomationConfig>(ctx.app, "/automation", automationConfig());
  const stub = stubProcess();
  const product = new ProductProcessService(new GatedConfigStore(), {
    ...stub.deps,
    probe: () => Promise.resolve({ ok: true }),
  });
  const project = ctx.registry.resolve();

  // Act
  await Promise.all([product.start(project), product.start(project)]);

  // Assert
  expect(stub.starts()).toBe(1);
  await product.shutdown();
});

test("a refresh whose start command vanished reports why instead of rejecting into the run loop", async () => {
  // Arrange — `runCompleted` fires this without awaiting it, so a rejection here
  // would surface as an unhandled rejection and take the server down.
  await put<ProjectAutomationConfig>(ctx.app, "/automation", automationConfig());
  const stub = stubProcess();
  const product = new ProductProcessService(new AutomationConfigStore(), {
    ...stub.deps,
    probe: () => Promise.resolve({ ok: true }),
  });
  const project = ctx.registry.resolve();
  await product.start(project);
  await product.settle();
  await put<ProjectAutomationConfig>(ctx.app, "/automation", { version: 1, validation: [] });

  // Act
  await product.refreshFor(project.id);

  // Assert
  const status = await product.status(project);
  expect(status.state).toBe("stopped");
  expect(status.lastError).toContain("Could not restart the product");
});

test("a product that dies while its headers are being read is not then announced as ready", async () => {
  // Arrange
  await put<ProjectAutomationConfig>(ctx.app, "/automation", automationConfig());
  const stub = stubProcess();
  const product = new ProductProcessService(new AutomationConfigStore(), {
    ...stub.deps,
    probe: () => Promise.resolve({ ok: true }),
    headers: () => dyingDuringProbe(stub),
  });
  const project = ctx.registry.resolve();

  // Act
  await product.start(project);

  // Assert
  await product.settle();
  expect((await product.status(project)).state).toBe("exited");
});

test("a product that exits on its own is reported as exited rather than left looking ready", async () => {
  // Arrange
  await put<ProjectAutomationConfig>(ctx.app, "/automation", automationConfig());
  const stub = stubProcess();
  const product = new ProductProcessService(new AutomationConfigStore(), {
    ...stub.deps,
    probe: () => Promise.resolve({ ok: true }),
  });
  const project = ctx.registry.resolve();
  await product.start(project);
  await product.settle();

  // Act
  stub.exit({ exitCode: 1, errorMessage: "Process exited with code 1" });

  // Assert
  await product.settle();
  const status = await product.status(project);
  expect(status.state).toBe("exited");
  expect(status.lastError).toBe("Process exited with code 1");
});

test("starting the product for another project stops the one already running", async () => {
  // Arrange
  await put<ProjectAutomationConfig>(ctx.app, "/automation", automationConfig());
  const stub = stubProcess();
  const product = new ProductProcessService(new AutomationConfigStore(), {
    ...stub.deps,
    probe: () => Promise.resolve({ ok: true }),
  });
  const first = ctx.registry.resolve();
  await product.start(first);
  await product.settle();
  const second = await addTestProject(ctx.registry, "second-project");
  await put<ProjectAutomationConfig>(ctx.app, "/automation", automationConfig(), second.headers);

  // Act
  await product.start(ctx.registry.resolve(second.id));

  // Assert
  expect(stub.killed()).toBe(true);
  expect((await product.status(first)).state).toBe("stopped");
  await product.shutdown();
});

test("a fresh build restarts the running product, so the preview is never the previous build", async () => {
  // Arrange
  await put<ProjectAutomationConfig>(ctx.app, "/automation", automationConfig());
  const stub = stubProcess();
  const product = new ProductProcessService(new AutomationConfigStore(), {
    ...stub.deps,
    probe: () => Promise.resolve({ ok: true }),
  });
  const project = ctx.registry.resolve();
  await product.start(project);
  await product.settle();

  // Act
  await product.refreshFor(project.id);

  // Assert
  await product.settle();
  expect(stub.starts()).toBe(2);
  expect((await product.status(project)).state).toBe("ready");
  await product.shutdown();
});

test("a run finishing in another project leaves this project's preview alone", async () => {
  // Arrange
  await put<ProjectAutomationConfig>(ctx.app, "/automation", automationConfig());
  const stub = stubProcess();
  const product = new ProductProcessService(new AutomationConfigStore(), {
    ...stub.deps,
    probe: () => Promise.resolve({ ok: true }),
  });
  const project = ctx.registry.resolve();
  await product.start(project);
  await product.settle();

  // Act
  await product.refreshFor("some-other-project");

  // Assert
  expect(stub.starts()).toBe(1);
  await product.shutdown();
});

test("stopping waits for the process to actually go, so a shutting-down server does not race its own kill", async () => {
  // Arrange — killing this product is acknowledged a tick before the process is gone,
  // which on Windows is what `taskkill /T /F` really does.
  await put<ProjectAutomationConfig>(ctx.app, "/automation", automationConfig());
  const stub = lingeringProcess();
  const product = new ProductProcessService(new AutomationConfigStore(), {
    ...stub.deps,
    probe: () => Promise.resolve({ ok: true }),
  });
  await product.start(ctx.registry.resolve());
  await product.settle();

  // Act
  await product.stop();

  // Assert
  expect(stub.gone()).toBe(true);
});

test("switching project stops the product on the server, so a closed browser cannot leak it", async () => {
  // Arrange — asked about the project that owns it, not the one just switched to,
  // which reads as stopped either way.
  const owner = ctx.registry.resolve().id;
  await put<ProjectAutomationConfig>(ctx.app, "/automation", automationConfig());
  await post<ProductProcessStatus>(ctx.app, "/automation/product/start");
  const elsewhere = await addTestProject(ctx.registry, "elsewhere");

  // Act
  await post(ctx.app, `/projects/${elsewhere.id}/activate`);

  // Assert
  const { body } = await get<ProductProcessStatus>(ctx.app, "/automation/product", {
    [PROJECT_HEADER]: owner,
  });
  expect(body.state).toBe("stopped");
});

test("a project with no start command reports the preview as unconfigured rather than stopped-and-startable", async () => {
  // Act
  const { status, body } = await get<ProductProcessStatus>(ctx.app, "/automation/product");

  // Assert
  expect(status).toBe(200);
  expect(body).toEqual({ state: "stopped", configured: false });
});

test("starting a product the project never declared is refused, not attempted", async () => {
  // Act
  const { status } = await post(ctx.app, "/automation/product/start");

  // Assert
  expect(status).toBe(409);
});

test("the start endpoint answers as soon as the process is spawned, without waiting for readiness", async () => {
  // Arrange
  await put<ProjectAutomationConfig>(ctx.app, "/automation", automationConfig());

  // Act
  const { status, body } = await post<ProductProcessStatus>(ctx.app, "/automation/product/start");

  // Assert
  expect(status).toBe(200);
  expect(body.state).toBe("starting");
  expect(body.url).toBe(HEALTH_URL);
});

function uiAutomation(overrides: Partial<UiAutomation> = {}): UiAutomation {
  return {
    start: overrides.start ?? {
      executable: process.execPath,
      args: ["-e", "setTimeout(() => {}, 10000)"],
      timeoutMs: 10_000,
    },
    healthUrl: overrides.healthUrl ?? HEALTH_URL,
    readyTimeoutMs: overrides.readyTimeoutMs ?? 200,
  };
}

const PROBE_LATENCY_MS = 5;

/** A real probe loses to its own abort signal; an immediate stub never does. */
function servingUntilAborted(_url: string, init: { signal: AbortSignal }): Promise<{ ok: boolean }> {
  return new Promise((resolve, reject) => {
    const abort = (): void => reject(new Error("aborted"));
    if (init.signal.aborted) {
      abort();
      return;
    }
    init.signal.addEventListener("abort", abort, { once: true });
    setTimeout(() => resolve({ ok: true }), PROBE_LATENCY_MS).unref();
  });
}

function automationConfig(): ProjectAutomationConfig {
  return { version: 1, validation: [], ui: uiAutomation() };
}

interface StubProcess {
  deps: Partial<ProductProcessDependencies>;
  starts(): number;
  killed(): boolean;
  exit(overrides?: Partial<SubprocessResult>): void;
  emitStderr(line: string): void;
}

/**
 * The product process seen from the service's side: a handle that stays alive
 * until the test kills or exits it. Spawning the project's real dev server in a
 * component test is exactly what this task exists to stop agents doing.
 */
function stubProcess(): StubProcess {
  let starts = 0;
  let killed = false;
  let settle: ((result: SubprocessResult) => void) | undefined;
  let emit: SubprocessSpec["onLine"];
  return {
    deps: {
      start: (spec: SubprocessSpec): SubprocessHandle => {
        starts += 1;
        emit = spec.onLine;
        return {
          pid: 4242,
          kill: () => {
            killed = true;
            settle?.(subprocessResult({ termSignal: "SIGTERM" }));
          },
          exited: new Promise<SubprocessResult>((resolve) => {
            settle = resolve;
          }),
        };
      },
      probe: () => Promise.resolve({ ok: false }),
      headers: () => Promise.resolve({}),
      sleep: () => Promise.resolve(),
    },
    starts: () => starts,
    killed: () => killed,
    exit: (overrides: Partial<SubprocessResult> = {}) => settle?.(subprocessResult(overrides)),
    emitStderr: (line: string) => emit?.("stderr", line),
  };
}

/**
 * Reading the config is the await both racing callers park on. A plain delay
 * does not reproduce the race: the two resume across a timer boundary, and Node
 * drains microtasks in between, so the first caller finishes launching before
 * the second wakes. This releases both from a single resolution instead, which
 * is what two requests landing together actually look like.
 */
class GatedConfigStore extends AutomationConfigStore {
  private arrived = 0;
  private release = (): void => {};
  private readonly opened = new Promise<void>((resolve) => {
    this.release = resolve;
    setTimeout(resolve, GATE_FALLBACK_MS).unref();
  });

  override async get(project: ProjectPath): Promise<ProjectAutomationConfig> {
    const config = await super.get(project);
    this.arrived += 1;
    if (this.arrived >= 2) {
      this.release();
    }
    await this.opened;
    return config;
  }
}

async function dyingDuringProbe(stub: StubProcess): Promise<ProductResponseHeaders> {
  stub.exit({ exitCode: 0, errorMessage: "Stopped with exit code 0" });
  await Promise.resolve();
  return {};
}

interface LingeringProcess {
  deps: Partial<ProductProcessDependencies>;
  gone(): boolean;
}

function lingeringProcess(): LingeringProcess {
  let gone = false;
  return {
    deps: {
      start: (): SubprocessHandle => {
        let settle: (result: SubprocessResult) => void;
        const exited = new Promise<SubprocessResult>((resolve) => {
          settle = resolve;
        });
        return {
          pid: 4243,
          kill: () =>
            setTimeout(() => {
              gone = true;
              settle(subprocessResult({ termSignal: "SIGKILL" }));
            }, 5),
          exited,
        };
      },
      headers: () => Promise.resolve({}),
      sleep: () => Promise.resolve(),
    },
    gone: () => gone,
  };
}

function subprocessResult(overrides: Partial<SubprocessResult> = {}): SubprocessResult {
  return {
    success: overrides.success ?? false,
    exitCode: overrides.exitCode ?? 0,
    termSignal: overrides.termSignal ?? null,
    timedOut: overrides.timedOut ?? false,
    aborted: overrides.aborted ?? false,
    stdout: overrides.stdout ?? "",
    stderrTail: overrides.stderrTail ?? [],
    durationMs: overrides.durationMs ?? 1,
    errorMessage: overrides.errorMessage,
  };
}
