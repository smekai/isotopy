// Project isolation, proven at the API boundary. Two projects pointing at two
// directories must not see each other's history, must write their runs into
// their own `.adhd/`, and must never have an API key written inside them.
import { readFile, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { HOME_PROJECT_ID } from "@adhd/core";
import type { ProjectsView, RunState, SettingsView } from "@adhd/core";
import {
  addTestProject,
  createTestApp,
  del,
  get,
  post,
  put,
  startRun,
  waitForRunStatus,
} from "./support/harness.ts";
import type { TestApp } from "./support/harness.ts";

/** One real (mocked) engine box — the shortest run that has a workspace. */
const ENGINE_RUN = { pipelineId: "solo", task: "work here", engine: "claude-code" };

let ctx: TestApp;

beforeEach(async () => {
  ctx = await createTestApp();
});

afterEach(async () => {
  await ctx.dispose();
});

async function exists(target: string): Promise<boolean> {
  return stat(target)
    .then(() => true)
    .catch(() => false);
}

test("the registry starts with just the home project, active", async () => {
  // Act
  const { body } = await get<ProjectsView>(ctx.app, "/projects");

  // Assert
  expect(body.activeProjectId).toBe(HOME_PROJECT_ID);
  expect(body.projects.map((project) => project.id)).toEqual([HOME_PROJECT_ID]);
});

test("adding a project creates a self-ignoring .adhd folder inside it", async () => {
  // Arrange
  const added = await addTestProject(ctx.registry, "proj");

  // Assert
  const gitignore = await readFile(path.join(added.root, ".adhd", ".gitignore"), "utf8");
  expect(gitignore.trim()).toBe("*");
});

test("adding the same folder twice returns one project, not two", async () => {
  // Arrange
  const first = await addTestProject(ctx.registry, "dup");

  // Act
  const { status, body } = await post<{ project: { id: string } } & ProjectsView>(
    ctx.app,
    "/projects",
    { root: first.root },
  );

  // Assert
  expect(status).toBe(201);
  expect(body.project.id).toBe(first.id);
  expect(body.projects.filter((project) => project.id === first.id)).toHaveLength(1);
});

test("a run is written into its own project's .adhd, not the home project's", async () => {
  // Arrange
  const project = await addTestProject(ctx.registry, "writes");

  // Act
  ctx.engine.anticipate().reports("done");
  const run = await startRun(ctx.app, { ...ENGINE_RUN, task: "in project" }, project.headers);
  await waitForRunStatus(ctx.app, run.id, "completed");
  await ctx.orchestrator.shutdown();

  // Assert
  expect(run.projectId).toBe(project.id);
  expect(await exists(path.join(project.root, ".adhd", "runs.db"))).toBe(true);
  expect(await exists(path.join(ctx.home, "runs.db"))).toBe(false);
});

test("starting a run restores the .adhd git-ignore if the folder was wiped", async () => {
  // Arrange
  const project = await addTestProject(ctx.registry, "reignore");
  await rm(path.join(project.root, ".adhd"), { recursive: true, force: true });

  // Act
  ctx.engine.anticipate().reports("done");
  const run = await startRun(ctx.app, ENGINE_RUN, project.headers);

  // Assert
  await waitForRunStatus(ctx.app, run.id, "completed");
  const gitignore = await readFile(path.join(project.root, ".adhd", ".gitignore"), "utf8");
  expect(gitignore.trim()).toBe("*");
});

test("an engine run works in the project folder itself", async () => {
  // Arrange
  const project = await addTestProject(ctx.registry, "cwd");
  ctx.engine.anticipate({ as: "Developer" }).reports("done");

  // Act
  const run = await startRun(ctx.app, ENGINE_RUN, project.headers);

  // Assert
  const finished = await waitForRunStatus(ctx.app, run.id, "completed");
  expect(finished.workspacePath).toBe(project.root);
  expect(ctx.engine.callAt(0).cwd).toBe(project.root);
});

test("a workspaceDir sent by the client is rejected at the boundary", async () => {
  // Arrange
  const project = await addTestProject(ctx.registry, "hardened");
  // Act
  const { status, body } = await post<{ error: string; issues: { message: string }[] }>(
    ctx.app,
    "/runs",
    { ...ENGINE_RUN, workspaceDir: ctx.userHome },
    project.headers,
  );

  // Assert
  expect(status).toBe(400);
  expect(body.error).toBe("Invalid request");
  expect(body.issues[0]?.message).toContain("workspaceDir");
});

test("a home run works in a scratch folder of its own, not in a real project", async () => {
  // Arrange
  ctx.engine.anticipate({ as: "Developer" }).reports("done");

  // Act
  const run = await startRun(ctx.app, ENGINE_RUN);

  // Assert
  const finished = await waitForRunStatus(ctx.app, run.id, "completed");
  expect(finished.workspacePath).toBe(path.join(ctx.home, "runs", run.id, "workspace"));
});

test("each project lists only its own runs", async () => {
  // Arrange
  const alpha = await addTestProject(ctx.registry, "alpha");
  const beta = await addTestProject(ctx.registry, "beta");

  // Act
  ctx.engine.anticipate().reports("done");
  ctx.engine.anticipate().reports("done");
  const inAlpha = await startRun(ctx.app, { ...ENGINE_RUN, task: "alpha work" }, alpha.headers);
  const inBeta = await startRun(ctx.app, { ...ENGINE_RUN, task: "beta work" }, beta.headers);
  await waitForRunStatus(ctx.app, inAlpha.id, "completed");
  await waitForRunStatus(ctx.app, inBeta.id, "completed");

  // Assert
  const { body: alphaRuns } = await get<RunState[]>(ctx.app, "/runs", alpha.headers);
  const { body: betaRuns } = await get<RunState[]>(ctx.app, "/runs", beta.headers);
  const { body: homeRuns } = await get<RunState[]>(ctx.app, "/runs");
  expect(alphaRuns.map((run) => run.id)).toEqual([inAlpha.id]);
  expect(betaRuns.map((run) => run.id)).toEqual([inBeta.id]);
  expect(homeRuns).toEqual([]);
});

test("run numbering restarts per project", async () => {
  // Arrange
  const alpha = await addTestProject(ctx.registry, "num-a");
  const beta = await addTestProject(ctx.registry, "num-b");

  // Act
  ctx.engine.anticipate().reports("done");
  const firstAlpha = await startRun(ctx.app, ENGINE_RUN, alpha.headers);
  await waitForRunStatus(ctx.app, firstAlpha.id, "completed");
  ctx.engine.anticipate().reports("done");
  ctx.engine.anticipate().reports("done");
  const secondAlpha = await startRun(ctx.app, ENGINE_RUN, alpha.headers);
  const firstBeta = await startRun(ctx.app, ENGINE_RUN, beta.headers);

  // Assert
  expect([firstAlpha.number, secondAlpha.number]).toEqual([1, 2]);
  expect(firstBeta.number).toBe(1);
  await waitForRunStatus(ctx.app, secondAlpha.id, "completed");
  await waitForRunStatus(ctx.app, firstBeta.id, "completed");
});

test("an API key is stored user-level and never inside the project folder", async () => {
  // Arrange
  const project = await addTestProject(ctx.registry, "secrets");

  // Act
  const { status } = await put<SettingsView>(
    ctx.app,
    "/settings/engines/claude-code",
    { connectionMode: "api-key", apiKey: "sk-ant-test-key" },
    project.headers,
  );

  // Assert
  expect(status).toBe(200);
  const userSettings = await readFile(path.join(ctx.userHome, "settings.json"), "utf8");
  expect(userSettings).toContain("sk-ant-test-key");
  const projectData = await readdir(path.join(project.root, ".adhd"));
  expect(projectData).not.toContain("settings.json");
});

test("a key set on one project does not leak into another", async () => {
  // Arrange
  const alpha = await addTestProject(ctx.registry, "key-a");
  const beta = await addTestProject(ctx.registry, "key-b");

  // Act
  await put<SettingsView>(
    ctx.app,
    "/settings/engines/claude-code",
    { connectionMode: "api-key", apiKey: "sk-ant-alpha" },
    alpha.headers,
  );

  // Assert
  const { body: alphaView } = await get<SettingsView>(ctx.app, "/settings", alpha.headers);
  const { body: betaView } = await get<SettingsView>(ctx.app, "/settings", beta.headers);
  expect(alphaView.engines["claude-code"]?.apiKeyConfigured).toBe(true);
  expect(betaView.engines["claude-code"]?.apiKeyConfigured).toBe(false);
});

test("removing a project unregisters it but leaves its folder and history on disk", async () => {
  // Arrange
  const project = await addTestProject(ctx.registry, "keepfiles");
  ctx.engine.anticipate().reports("done");
  const run = await startRun(ctx.app, ENGINE_RUN, project.headers);
  await waitForRunStatus(ctx.app, run.id, "completed");
  await ctx.orchestrator.shutdown();

  // Act
  const { status, body } = await del<ProjectsView>(ctx.app, `/projects/${project.id}`);

  // Assert
  expect(status).toBe(200);
  expect(body.projects.map((entry) => entry.id)).not.toContain(project.id);
  expect(await exists(path.join(project.root, ".adhd", "runs.db"))).toBe(true);
});

test("the home project cannot be removed", async () => {
  // Act
  const { status } = await del<{ error: string }>(ctx.app, `/projects/${HOME_PROJECT_ID}`);

  // Assert
  expect(status).toBe(400);
});

test("adding a folder that does not exist is rejected", async () => {
  // Act
  const { status, body } = await post<{ error: string }>(ctx.app, "/projects", {
    root: path.join(ctx.userHome, "no-such-folder"),
  });

  // Assert
  expect(status).toBe(400);
  expect(body.error).toMatch(/does not exist/);
});

test("activating a project switches which runs an unheadered request sees", async () => {
  // Arrange
  const project = await addTestProject(ctx.registry, "switch");
  ctx.engine.anticipate().reports("done");
  const run = await startRun(ctx.app, ENGINE_RUN, project.headers);
  await waitForRunStatus(ctx.app, run.id, "completed");

  // Act
  await post<ProjectsView>(ctx.app, `/projects/${project.id}/activate`);

  // Assert
  const { body } = await get<RunState[]>(ctx.app, "/runs");
  expect(body.map((entry) => entry.id)).toEqual([run.id]);
});
