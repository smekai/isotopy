import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { STAGE_OUTCOMES, STAGE_VERDICTS, stageTitleIn } from "@isotopy/core";
import type { CiResult, RunBranch, RunState, StageDefinition, StageOutcome } from "@isotopy/core";
import {
  renderChecksTimedOut,
  renderFailingChecks,
  renderPullRequestBody,
} from "../domain/markdown/pull-request.ts";
import type {
  FailingCheck,
  PreviewNote,
  PullRequestBody,
} from "../domain/markdown/pull-request.ts";
import {
  actionsRunId,
  ciStateOf,
  failingChecks,
  pullRequestTitle,
} from "../domain/rules/pull-request-release.ts";
import type { CiState } from "../domain/rules/pull-request-release.ts";
import { runArtifactsDir } from "../paths.ts";
import { messageOf } from "../utils/message-of.ts";
import type { StageWorkContext, WorkflowDeps } from "./types.ts";

export interface ReleaseWork {
  context: StageWorkContext;
  stageDef: StageDefinition;
}

export interface ReleaseOpened {
  outcome: StageOutcome;
  url?: string;
}

export interface ChecksWork extends ReleaseWork {
  url: string;
  poll: number;
}

export interface SettleWork extends ReleaseWork {
  url: string;
  ci: CiResult;
}

interface ReleaseTarget {
  run: RunState;
  root: string;
  branch: RunBranch;
}

const PULL_REQUEST_BODY_FILE = "pull-request.md";

function releaseTarget(deps: WorkflowDeps, runId: string): ReleaseTarget | undefined {
  const run = deps.projection.getRun(runId);
  if (run?.branch === undefined) {
    return undefined;
  }
  return { run, root: deps.registry.resolve(run.projectId).root, branch: run.branch };
}

function failRelease(
  deps: WorkflowDeps,
  runId: string,
  stageId: string,
  reason: string,
): ReleaseOpened {
  deps.projection.stageFailed(runId, stageId, reason);
  return { outcome: STAGE_OUTCOMES.FAILED };
}

export async function openPullRequestWork(
  deps: WorkflowDeps,
  work: ReleaseWork,
): Promise<ReleaseOpened> {
  const { projection } = deps;
  const { runId } = work.context;
  const stageId = work.stageDef.id;
  const target = releaseTarget(deps, runId);
  if (target === undefined) {
    return failRelease(deps, runId, stageId, "The release run has no initiative branch to push");
  }
  const { run, root, branch } = target;
  projection.stageStarted(runId, stageId);
  projection.log(runId, stageId, {
    level: "run",
    message: `${stageTitleIn(run, stageId)} pushing ${branch.name} to origin`,
  });
  const pushed = await deps.release.push(root, branch);
  if (!pushed.ok) {
    return failRelease(deps, runId, stageId, pushed.reason);
  }
  const preview = await deployPreview(deps, run, work.stageDef);
  const context = await deps.orchestration()?.releaseContextFor(runId);
  const goal = context?.goal ?? run.task ?? branch.name;
  const bodyFile = await writePullRequestBody(deps, target, { ...context, goal, preview });
  const opened = await deps.release.openOrUpdate(root, {
    branch,
    title: pullRequestTitle(goal),
    bodyFile,
  });
  if (!opened.ok) {
    return failRelease(deps, runId, stageId, opened.reason);
  }
  projection.recordPullRequest(runId, {
    url: opened.value,
    previewUrl: preview?.kind === "deployed" ? preview.url : undefined,
  });
  projection.log(runId, stageId, {
    level: "info",
    message: `Pull request ${opened.value} is open — waiting for its checks`,
  });
  return { outcome: STAGE_OUTCOMES.PASSED, url: opened.value };
}

async function writePullRequestBody(
  deps: WorkflowDeps,
  { run, root, branch }: ReleaseTarget,
  body: Omit<PullRequestBody, "counts">,
): Promise<string> {
  const artifacts = runArtifactsDir(deps.registry.resolve(run.projectId), run.id);
  await mkdir(artifacts, { recursive: true });
  const bodyFile = path.join(artifacts, PULL_REQUEST_BODY_FILE);
  await writeFile(
    bodyFile,
    renderPullRequestBody({ ...body, counts: await deps.release.changeCounts(root, branch) }),
    "utf8",
  );
  return bodyFile;
}

async function deployPreview(
  deps: WorkflowDeps,
  run: RunState,
  stageDef: StageDefinition,
): Promise<PreviewNote | undefined> {
  const project = deps.registry.resolve(run.projectId);
  const target = (await deps.automation.get(project)).preview;
  if (target === undefined) {
    return undefined;
  }
  deps.projection.log(run.id, stageDef.id, {
    level: "run",
    message: "Deploying the preview for the pull request",
  });
  const controller = deps.beginEngineStage(run.id);
  const logLines: string[] = [];
  try {
    const result = await deps.deployment.run({
      project,
      environment: "preview",
      target,
      signal: controller.signal,
      onLine: (stream, line) => logLines.push(`[${stream}] ${line}`),
    });
    await deps.projection.captureDeployment(run.id, stageDef, result, logLines);
    if (result.verdict === "fail" || result.url === undefined) {
      return { kind: "failed", reason: result.failureMessage ?? "the deployment printed no URL" };
    }
    deps.projection.log(run.id, stageDef.id, {
      level: "pass",
      message: `Preview deployed — ${result.url}`,
    });
    return { kind: "deployed", url: result.url };
  } catch (error) {
    return { kind: "failed", reason: messageOf(error) };
  } finally {
    deps.endEngineStage(run.id);
  }
}

export async function readChecksWork(deps: WorkflowDeps, work: ChecksWork): Promise<CiState> {
  const target = releaseTarget(deps, work.context.runId);
  if (target === undefined) {
    return "failed";
  }
  const report = await deps.release.checks(target.root, work.url);
  if (!report.ok) {
    deps.projection.log(work.context.runId, work.stageDef.id, {
      level: "warn",
      message: report.reason,
    });
    return "pending";
  }
  return ciStateOf(report.value, work.poll);
}

export async function settleReleaseWork(
  deps: WorkflowDeps,
  work: SettleWork,
): Promise<StageOutcome> {
  const target = releaseTarget(deps, work.context.runId);
  if (target === undefined) {
    return failRelease(
      deps,
      work.context.runId,
      work.stageDef.id,
      "The release run lost its branch",
    ).outcome;
  }
  switch (work.ci) {
    case "passed":
      return mergePullRequest(deps, work, target);
    case "failed":
      return holdOnFailedChecks(deps, work, target);
    case "timed_out":
      return holdPullRequest(
        deps,
        work,
        renderChecksTimedOut(work.url, Math.round(deps.release.checkTimeoutMs / 60_000)),
        [],
        "CI did not settle in time; the pull request stays open",
      );
    default:
      return work.ci satisfies never;
  }
}

async function mergePullRequest(
  deps: WorkflowDeps,
  work: SettleWork,
  target: ReleaseTarget,
): Promise<StageOutcome> {
  const { projection } = deps;
  const { runId } = work.context;
  const stageId = work.stageDef.id;
  const merged = await deps.release.merge(target.root, target.branch, work.url);
  if (!merged.ok) {
    return holdPullRequest(
      deps,
      work,
      `# CI passed, but the merge was refused\n\n${merged.reason}\n`,
      [],
      merged.reason,
      "passed",
    );
  }
  for (const warning of merged.value.warnings) {
    projection.log(runId, stageId, { level: "warn", message: warning });
  }
  projection.recordPullRequest(runId, {
    url: work.url,
    ci: "passed",
    mergeCommit: merged.value.mergeCommit,
  });
  const message = `Merged ${work.url} into ${target.branch.base}${merged.value.mergeCommit === undefined ? "" : ` as ${merged.value.mergeCommit}`}`;
  await projection.captureStageOutput(runId, work.stageDef, `# ${message}\n`);
  projection.setVerdict(runId, stageId, STAGE_VERDICTS.PASS);
  projection.log(runId, stageId, { level: "pass", message });
  projection.stagePassed(runId, stageId);
  return STAGE_OUTCOMES.PASSED;
}

async function holdOnFailedChecks(
  deps: WorkflowDeps,
  work: SettleWork,
  target: ReleaseTarget,
): Promise<StageOutcome> {
  const report = await deps.release.checks(target.root, work.url);
  const failing = report.ok ? failingChecks(report.value) : [];
  const withLogs: FailingCheck[] = [];
  for (const check of failing) {
    const runId = actionsRunId(check.link);
    withLogs.push({
      ...check,
      log: runId === undefined ? undefined : await deps.release.failedLog(target.root, runId),
    });
  }
  const names = failing.map((check) => check.name);
  return holdPullRequest(
    deps,
    work,
    renderFailingChecks(work.url, withLogs),
    names,
    `CI failed${names.length === 0 ? "" : `: ${names.join(", ")}`} — the pull request stays open`,
  );
}

async function holdPullRequest(
  deps: WorkflowDeps,
  work: SettleWork,
  output: string,
  failing: string[],
  reason: string,
  ci: CiResult = work.ci,
): Promise<StageOutcome> {
  const { projection } = deps;
  const { runId } = work.context;
  projection.recordPullRequest(runId, {
    url: work.url,
    ci,
    failingChecks: failing.length === 0 ? undefined : failing,
  });
  await projection.captureStageOutput(runId, work.stageDef, output);
  projection.setVerdict(runId, work.stageDef.id, STAGE_VERDICTS.FAIL);
  projection.stageFailed(runId, work.stageDef.id, reason);
  return STAGE_OUTCOMES.NEEDS_ATTENTION;
}
