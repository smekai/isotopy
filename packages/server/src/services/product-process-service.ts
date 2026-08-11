import type {
  ProductFraming,
  ProductProcessState,
  ProductProcessStatus,
  UiAutomation,
} from "@adhd/core";
import { isProductLive } from "@adhd/core";
import { commandForPlatform, deploymentWorkingDirectory } from "../domain/rules/deployment.ts";
import { framingVerdict, readyPollIntervalMs } from "../domain/rules/product-preview.ts";
import type { ProductResponseHeaders } from "../domain/rules/product-preview.ts";
import { startSubprocess } from "../engines/subprocess.ts";
import type { SubprocessHandle, SubprocessResult, SubprocessSpec } from "../engines/subprocess.ts";
import type { ProjectPath } from "../paths.ts";
import { pollUntilHealthy } from "../utils/health-poll.ts";
import type { HealthProbe } from "../utils/health-poll.ts";
import type { AutomationConfigStore } from "./automation-config-store.ts";

const STDERR_TAIL_LINES = 10;
const KILL_SETTLE_MS = 5000;

export class ProductNotConfiguredError extends Error {
  constructor() {
    super("This project has no start command — configure one in Setup → Automation.");
    this.name = "ProductNotConfiguredError";
  }
}

type SubprocessStarter = (spec: SubprocessSpec) => SubprocessHandle;

type HeaderProbe = (url: string) => Promise<ProductResponseHeaders>;

export interface ProductProcessDependencies {
  platform: NodeJS.Platform;
  start: SubprocessStarter;
  probe: HealthProbe;
  headers: HeaderProbe;
  now: () => Date;
  sleep: (milliseconds: number) => Promise<void>;
}

interface RunningProduct {
  project: ProjectPath;
  ui: UiAutomation;
  handle: SubprocessHandle;
  stopping: AbortController;
  startedAt: string;
  state: ProductProcessState;
  framing?: ProductFraming;
  readyAt?: string;
  lastError?: string;
  stderrTail: string[];
}

async function readHeaders(url: string): Promise<ProductResponseHeaders> {
  const { headers } = await fetch(url, { redirect: "manual" });
  const xFrameOptions = headers.get("x-frame-options");
  const contentSecurityPolicy = headers.get("content-security-policy");
  return {
    ...(xFrameOptions === null ? {} : { xFrameOptions }),
    ...(contentSecurityPolicy === null ? {} : { contentSecurityPolicy }),
  };
}

function defaultDependencies(): ProductProcessDependencies {
  return {
    platform: process.platform,
    start: startSubprocess,
    probe: (url, init) => fetch(url, init),
    headers: readHeaders,
    now: () => new Date(),
    sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  };
}

function statusOf(current: RunningProduct): ProductProcessStatus {
  return {
    state: current.state,
    configured: true,
    projectId: current.project.id,
    url: current.ui.healthUrl,
    startedAt: current.startedAt,
    ...(current.framing === undefined ? {} : { framing: current.framing }),
    ...(current.readyAt === undefined ? {} : { readyAt: current.readyAt }),
    ...(current.lastError === undefined ? {} : { lastError: current.lastError }),
  };
}

function exitedWithin(handle: SubprocessHandle, milliseconds: number): Promise<unknown> {
  return Promise.race([
    handle.exited,
    new Promise((resolve) => {
      setTimeout(resolve, milliseconds).unref();
    }),
  ]);
}

function notReadyMessage(ui: UiAutomation, stderrTail: string[]): string {
  const tail = stderrTail.join(" ").trim();
  const waited = Math.round(ui.readyTimeoutMs / 1000);
  return `${ui.healthUrl} did not respond within ${waited}s${tail ? ` — ${tail}` : ""}`;
}

export class ProductProcessService {
  private readonly deps: ProductProcessDependencies;
  private current?: RunningProduct;
  private pending?: Promise<void>;

  constructor(
    private readonly automation: AutomationConfigStore,
    deps: Partial<ProductProcessDependencies> = {},
  ) {
    this.deps = { ...defaultDependencies(), ...deps };
  }

  async status(project: ProjectPath): Promise<ProductProcessStatus> {
    const configured = (await this.automation.get(project)).ui !== undefined;
    return this.current?.project.id === project.id
      ? statusOf(this.current)
      : { state: "stopped", configured };
  }

  async start(project: ProjectPath): Promise<ProductProcessStatus> {
    const ui = (await this.automation.get(project)).ui;
    if (ui === undefined) {
      throw new ProductNotConfiguredError();
    }
    const current = this.current;
    if (current !== undefined && current.project.id === project.id && isProductLive(current.state)) {
      return statusOf(current);
    }
    await this.stop();
    return this.launch(project, ui);
  }

  async restart(project: ProjectPath): Promise<ProductProcessStatus> {
    await this.stop();
    return this.start(project);
  }

  async stop(): Promise<void> {
    const current = this.current;
    if (current === undefined) {
      return;
    }
    this.current = undefined;
    current.stopping.abort();
    current.handle.kill();
    await this.settle();
    await exitedWithin(current.handle, KILL_SETTLE_MS);
  }

  urlFor(projectId: string): string | undefined {
    const current = this.current;
    return current?.project.id === projectId && current.state === "ready"
      ? current.ui.healthUrl
      : undefined;
  }

  async refreshFor(projectId: string): Promise<void> {
    const current = this.current;
    if (current === undefined || current.project.id !== projectId || !isProductLive(current.state)) {
      return;
    }
    await this.restart(current.project);
  }

  async settle(): Promise<void> {
    await this.pending;
  }

  async shutdown(): Promise<void> {
    await this.stop();
  }

  private launch(project: ProjectPath, ui: UiAutomation): ProductProcessStatus {
    const command = commandForPlatform(ui.start, this.deps.platform);
    const cwd = deploymentWorkingDirectory(project.root, ui.start.cwd);
    const stderrTail: string[] = [];
    const handle = this.deps.start({
      command: command.executable,
      args: command.args,
      cwd,
      onLine: (stream, line) => {
        if (stream === "stderr") {
          stderrTail.push(line);
          stderrTail.splice(0, Math.max(0, stderrTail.length - STDERR_TAIL_LINES));
        }
      },
    });
    const current: RunningProduct = {
      project,
      ui,
      handle,
      stopping: new AbortController(),
      startedAt: this.deps.now().toISOString(),
      state: "starting",
      stderrTail,
    };
    this.current = current;
    this.pending = this.watch(current);
    return statusOf(current);
  }

  private async watch(current: RunningProduct): Promise<void> {
    void current.handle.exited.then((result) => noteExit(current, result));
    const healthy = await pollUntilHealthy(this.deps, {
      url: current.ui.healthUrl,
      timeoutMs: current.ui.readyTimeoutMs,
      intervalMs: readyPollIntervalMs(current.ui.readyTimeoutMs),
      signal: current.stopping.signal,
    });
    if (this.current !== current || current.state === "exited") {
      return;
    }
    if (!healthy) {
      current.state = "failed";
      current.lastError = notReadyMessage(current.ui, current.stderrTail);
      current.handle.kill();
      return;
    }
    current.framing = await this.framingOf(current.ui.healthUrl);
    current.state = "ready";
    current.readyAt = this.deps.now().toISOString();
  }

  private async framingOf(url: string): Promise<ProductFraming> {
    try {
      return framingVerdict(await this.deps.headers(url));
    } catch {
      return { allowed: true };
    }
  }
}

function noteExit(current: RunningProduct, result: SubprocessResult): void {
  current.stopping.abort();
  if (!isProductLive(current.state)) {
    return;
  }
  current.state = "exited";
  current.lastError = result.errorMessage ?? `Stopped with exit code ${result.exitCode}`;
}
