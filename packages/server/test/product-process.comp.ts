import { afterEach, beforeEach, expect, test } from "vitest";
import type { ProductProcessStatus, ProjectAutomationConfig, UiAutomation } from "@adhd/core";
import { AutomationConfigStore } from "../src/services/automation-config-store.ts";
import { ProductProcessService } from "../src/services/product-process-service.ts";
import type { ProductProcessDependencies } from "../src/services/product-process-service.ts";
import type { SubprocessHandle, SubprocessResult, SubprocessSpec } from "../src/engines/subprocess.ts";
import { addTestProject, createTestApp, get, post, put } from "./support/harness.ts";
import type { TestApp } from "./support/harness.ts";

const HEALTH_URL = "http://127.0.0.1:59999/";

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
    ...(overrides.errorMessage === undefined ? {} : { errorMessage: overrides.errorMessage }),
  };
}
