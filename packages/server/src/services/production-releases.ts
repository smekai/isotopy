import { randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import path from "node:path";
import {
  PRODUCTION_VERIFICATION_PIPELINE,
  deploymentResultSchema,
  preferredRunOptions,
} from "@isotopy/core";
import type {
  DeploymentAutomation,
  DeploymentRecord,
  ProductionStatus,
  ProductionVerificationState,
} from "@isotopy/core";
import { renderProductionVerificationTask } from "../domain/markdown/production-verification-task.ts";
import { newestFirst, rollbackRefFor } from "../domain/rules/deployment.ts";
import {
  PRODUCTION_CHECK_PERMISSION_MODE,
  productionCheckRefusal,
} from "../domain/rules/permission-plan.ts";
import { parseJson } from "../domain/validation.ts";
import type { ProjectPath } from "../paths.ts";
import { deploymentVerificationSchema } from "../schemas/deployment-verification.ts";
import type { DeploymentVerification } from "../schemas/deployment-verification.ts";
import { messageOf } from "../utils/message-of.ts";
import { readOptionalText, writeTextFile } from "../utils/text-file.ts";
import type { AutomationConfigStore } from "./automation-config-store.ts";
import type { DeploymentRunner } from "./deployment-runner.ts";
import type { RunService } from "./run/run-service.ts";
import type { SettingsStore } from "./settings-store.ts";
import { persistProjectDeploymentArtifacts } from "./run-evidence.ts";

export const ROLLBACK_REF_ENV = "ISOTOPY_ROLLBACK_REF";

export class NoProductionTargetError extends Error {
  constructor() {
    super("No production deployment target is configured");
  }
}

export class RollbackUnavailableError extends Error {}

function deploymentsDir(project: ProjectPath): string {
  return path.join(project.dataDir, "deployments");
}

function verificationFile(project: ProjectPath, id: string): string {
  return path.join(deploymentsDir(project), id, "verification.json");
}

export class ProductionReleases {
  constructor(
    private readonly automation: AutomationConfigStore,
    private readonly deployment: DeploymentRunner,
    private readonly runs: RunService,
    private readonly settings: SettingsStore,
    private readonly posix: boolean = process.platform !== "win32",
  ) {}

  async deploy(project: ProjectPath, signal?: AbortSignal): Promise<DeploymentRecord> {
    const target = await this.target(project);
    const record = await this.execute(project, target, { kind: "deploy", signal });
    if (record.result.verdict !== "pass" || target.verification === undefined) {
      return record;
    }
    const verification = await this.startVerification(project, record, target.verification.instructions);
    await writeTextFile(verificationFile(project, record.id), JSON.stringify(verification, null, 2));
    return { ...record, ...verification };
  }

  async rollback(project: ProjectPath, ref: string | undefined, signal?: AbortSignal): Promise<DeploymentRecord> {
    const target = await this.target(project);
    if (target.rollback === undefined) {
      throw new RollbackUnavailableError("The production target has no rollback command configured");
    }
    const rollbackRef = ref ?? rollbackRefFor(await this.history(project));
    if (rollbackRef === undefined) {
      throw new RollbackUnavailableError("No earlier deployed commit is recorded to roll back to; name one");
    }
    return this.execute(project, target, {
      kind: "rollback",
      command: target.rollback,
      env: { [ROLLBACK_REF_ENV]: rollbackRef },
      requestedRef: rollbackRef,
      signal,
    });
  }

  async status(project: ProjectPath): Promise<ProductionStatus> {
    const history = await this.history(project);
    const latest = newestFirst(history)[0];
    const verification =
      latest?.verificationRunId === undefined ? undefined : this.verificationState(latest.verificationRunId);
    return { latest, verification, rollbackRef: rollbackRefFor(history) };
  }

  private async target(project: ProjectPath): Promise<DeploymentAutomation> {
    const target = (await this.automation.get(project)).production;
    if (target === undefined) {
      throw new NoProductionTargetError();
    }
    return target;
  }

  private async execute(
    project: ProjectPath,
    target: DeploymentAutomation,
    options: Pick<Parameters<DeploymentRunner["run"]>[0], "kind" | "command" | "env" | "signal"> & {
      requestedRef?: string;
    },
  ): Promise<DeploymentRecord> {
    const id = randomUUID();
    const logLines: string[] = [];
    const { requestedRef, ...run } = options;
    const reported = await this.deployment.run({
      project,
      environment: "production",
      target,
      ...run,
      onLine: (stream, line) => logLines.push(`[${stream}] ${line}`),
    });
    const result = { ...reported, ref: reported.ref ?? requestedRef };
    await persistProjectDeploymentArtifacts(project, id, result, logLines);
    return { id, result };
  }

  private async startVerification(
    project: ProjectPath,
    record: DeploymentRecord,
    instructions: string,
  ): Promise<DeploymentVerification> {
    const task = renderProductionVerificationTask({
      url: record.result.url,
      ref: record.result.ref,
      rollbackRef: rollbackRefFor(await this.history(project)),
      instructions,
    });
    const preferred = preferredRunOptions(this.settings.getPreferences(project.id));
    const refusal = productionCheckRefusal(preferred.engine, this.posix);
    if (refusal !== undefined) {
      return { verificationRefusal: refusal };
    }
    try {
      const run = await this.runs.startComposedRun(project, PRODUCTION_VERIFICATION_PIPELINE, {
        ...preferred,
        permissionMode: PRODUCTION_CHECK_PERMISSION_MODE,
        task,
      });
      return { verificationRunId: run.id };
    } catch (error) {
      return { verificationRefusal: `The production check could not start: ${messageOf(error)}` };
    }
  }

  private verificationState(runId: string): ProductionVerificationState | undefined {
    const run = this.runs.getRun(runId);
    if (run === undefined) {
      return undefined;
    }
    return { runId, status: run.status, verdict: run.stages.at(-1)?.verdict };
  }

  private async history(project: ProjectPath): Promise<DeploymentRecord[]> {
    let ids: string[];
    try {
      ids = await readdir(deploymentsDir(project));
    } catch {
      return [];
    }
    const records = await Promise.all(ids.map((id) => this.readRecord(project, id)));
    return records.filter((record): record is DeploymentRecord => record !== undefined);
  }

  private async readRecord(project: ProjectPath, id: string): Promise<DeploymentRecord | undefined> {
    const result = await readOptionalText(path.join(deploymentsDir(project), id, "deployment.json"));
    const parsed = result === undefined ? undefined : parseJson(deploymentResultSchema, result);
    if (parsed === undefined || !parsed.ok) {
      return undefined;
    }
    const verificationText = await readOptionalText(verificationFile(project, id));
    const verification =
      verificationText === undefined ? undefined : parseJson(deploymentVerificationSchema, verificationText);
    return { id, result: parsed.value, ...(verification?.ok === true ? verification.value : {}) };
  }
}
