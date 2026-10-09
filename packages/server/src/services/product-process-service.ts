import type {
  ProductFraming,
  ProductProcessState,
  ProductProcessStatus,
  UiAutomation,
} from "@isotopy/core";
import { isProductLive } from "@isotopy/core";
import { commandForPlatform, deploymentWorkingDirectory } from "../domain/rules/deployment.ts";
import { framingVerdict, readyPollIntervalMs } from "../domain/rules/product-preview.ts";
import type { ProductResponseHeaders } from "../domain/rules/product-preview.ts";
import { startSubprocess } from "../engines/subprocess.ts";
import type { SubprocessHandle, SubprocessResult, SubprocessSpec } from "../engines/subprocess.ts";
import type { ProjectPath } from "../paths.ts";
import type { Logger } from "../utils/logger.ts";
import { messageOf } from "../utils/message-of.ts";
import { pollUntilHealthy } from "../utils/health-poll.ts";
import type { HealthProbe } from "../utils/health-poll.ts";
import type { AutomationConfigStore } from "./automation-config-store.ts";

const STDERR_TAIL_LINES = 10;
const KILL_SETTLE_MS = 5000;
const HEADER_PROBE_MS = 5000;
const ADOPT_PROBE_MS = 2000;

export class ProductNotConfiguredError extends Error {
  constructor() {
    super("This project has no start command — configure one in Setup → Automation.");
    this.name = "ProductNotConfiguredError";
  }
}

type SubprocessStarter = (spec: SubprocessSpec) => SubprocessHandle;

type HeaderProbe = (
  url: string,
  init: { signal: AbortSignal },
) => Promise<ProductResponseHeaders>;

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
  adopted?: boolean;
}

async function readHeaders(
  url: string,
  init: { signal: AbortSignal },
): Promise<ProductResponseHeaders> {
  const { headers } = await fetch(url, { redirect: "manual", signal: init.signal });
  const xFrameOptions = headers.get("x-frame-options");
  const contentSecurityPolicy = headers.get("content-security-policy");
  return {
    xFrameOptions: xFrameOptions ?? undefined,
    contentSecurityPolicy: contentSecurityPolicy ?? undefined,
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
    framing: current.framing,
    readyAt: current.readyAt,
    lastError: current.lastError,
    adopted: current.adopted,
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
  private readonly logger: Logger;
  private current?: RunningProduct;
  private pending?: Promise<void>;
  private exitNoted: Promise<void> = Promise.resolve();
  private abandonedError?: string;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly automation: AutomationConfigStore,
    logger: Logger,
    deps: Partial<ProductProcessDependencies> = {},
  ) {
    this.logger = logger.child("ProductProcessService");
    this.deps = { ...defaultDependencies(), ...deps };
  }

  async status(project: ProjectPath): Promise<ProductProcessStatus> {
    const configured = (await this.automation.get(project)).ui !== undefined;
    if (this.current?.project.id === project.id) {
      return statusOf(this.current);
    }
    return { state: "stopped", configured, lastError: this.abandonedError };
  }

  start(project: ProjectPath): Promise<ProductProcessStatus> {
    return this.serialize(() => this.launchFor(project));
  }

  restart(project: ProjectPath): Promise<ProductProcessStatus> {
    return this.serialize(async () => {
      await this.terminate();
      return this.launchFor(project);
    });
  }

  stop(): Promise<void> {
    return this.serialize(() => this.terminate());
  }

  stopUnless(projectId: string): Promise<void> {
    return this.serialize(async () => {
      if (this.current !== undefined && this.current.project.id !== projectId) {
        await this.terminate();
      }
    });
  }

  stopFor(projectId: string): Promise<void> {
    return this.serialize(async () => {
      if (this.current?.project.id === projectId) {
        await this.terminate();
      }
    });
  }

  urlFor(projectId: string): string | undefined {
    const current = this.current;
    return current?.project.id === projectId && current.state === "ready"
      ? current.ui.healthUrl
      : undefined;
  }

  refreshFor(projectId: string): Promise<void> {
    return this.serialize(() => this.refreshLocked(projectId));
  }

  async settle(): Promise<void> {
    await this.queue;
    await this.pending;
    await this.exitNoted;
  }

  shutdown(): Promise<void> {
    return this.serialize(() => this.terminate());
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation, operation);
    this.queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private async refreshLocked(projectId: string): Promise<void> {
    const current = this.current;
    if (current === undefined || current.project.id !== projectId || !isProductLive(current.state)) {
      return;
    }
    const { project } = current;
    await this.terminate();
    try {
      await this.launchFor(project);
    } catch (error) {
      this.abandonedError = `Could not restart the product: ${messageOf(error)}`;
    }
  }

  private async launchFor(project: ProjectPath): Promise<ProductProcessStatus> {
    const ui = (await this.automation.get(project)).ui;
    if (ui === undefined) {
      throw new ProductNotConfiguredError();
    }
    const current = this.current;
    if (current !== undefined && current.project.id === project.id && isProductLive(current.state)) {
      return statusOf(current);
    }
    await this.terminate();
    this.abandonedError = undefined;
    return this.launch(project, ui);
  }

  private async terminate(): Promise<void> {
    const current = this.current;
    if (current === undefined) {
      return;
    }
    this.current = undefined;
    current.stopping.abort();
    current.handle.kill();
    await this.pending;
    await exitedWithin(current.handle, KILL_SETTLE_MS);
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
    this.pending = this.watch(current).catch((error: unknown) => this.watchFailed(current, error));
    return statusOf(current);
  }

  private watchFailed(current: RunningProduct, error: unknown): void {
    this.logger.error(`Watching the product of project ${current.project.id} failed`, {
      error,
    });
    if (this.superseded(current)) {
      return;
    }
    current.state = "failed";
    current.lastError = `Isotopy stopped watching the product: ${messageOf(error)}`;
    current.handle.kill();
  }

  private async watch(current: RunningProduct): Promise<void> {
    void current.handle.exited.then((result) => {
      this.exitNoted = this.noteExit(current, result).catch((error: unknown) =>
        this.watchFailed(current, error),
      );
    });
    const healthy = await this.reachable(current);
    if (this.superseded(current)) {
      return;
    }
    if (!healthy) {
      if (current.state !== "exited") {
        current.state = "failed";
        current.lastError = notReadyMessage(current.ui, current.stderrTail);
        current.handle.kill();
      }
      return;
    }
    const framing = await this.framingOf(current.ui.healthUrl, current.stopping.signal);
    if (this.superseded(current) || this.diedWhileProbing(current)) {
      return;
    }
    current.framing = framing;
    current.state = "ready";
    current.readyAt = this.deps.now().toISOString();
  }

  private async reachable(current: RunningProduct): Promise<boolean> {
    const started = await pollUntilHealthy(this.deps, {
      url: current.ui.healthUrl,
      timeoutMs: current.ui.readyTimeoutMs,
      intervalMs: readyPollIntervalMs(current.ui.readyTimeoutMs),
      signal: current.stopping.signal,
    });
    if (started || current.state !== "exited" || this.superseded(current)) {
      return started;
    }
    if (!(await this.servedWithoutUs(current.ui.healthUrl))) {
      return false;
    }
    adopt(current);
    return true;
  }

  private async noteExit(current: RunningProduct, result: SubprocessResult): Promise<void> {
    const wasReady = current.state === "ready";
    current.stopping.abort();
    if (!isProductLive(current.state)) {
      return;
    }
    if (wasReady && !this.superseded(current) && (await this.servedWithoutUs(current.ui.healthUrl))) {
      adopt(current);
      return;
    }
    current.state = "exited";
    current.lastError = result.errorMessage ?? `Stopped with exit code ${result.exitCode}`;
  }

  private servedWithoutUs(url: string): Promise<boolean> {
    return pollUntilHealthy(this.deps, {
      url,
      timeoutMs: ADOPT_PROBE_MS,
      intervalMs: ADOPT_PROBE_MS,
      signal: AbortSignal.timeout(ADOPT_PROBE_MS),
    });
  }

  private superseded(current: RunningProduct): boolean {
    return this.current !== current;
  }

  private diedWhileProbing(current: RunningProduct): boolean {
    return current.state === "exited" && current.adopted !== true;
  }

  private async framingOf(url: string, stopping: AbortSignal): Promise<ProductFraming> {
    const attempt = AbortSignal.any([stopping, AbortSignal.timeout(HEADER_PROBE_MS)]);
    try {
      return framingVerdict(await this.deps.headers(url, { signal: attempt }));
    } catch {
      return { allowed: true };
    }
  }
}

function adopt(current: RunningProduct): void {
  current.adopted = true;
  current.lastError = undefined;
  current.stopping = new AbortController();
}
