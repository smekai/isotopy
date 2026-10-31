import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TEAM_FILE } from "@isotopy/core";
import type { PipelineDefinition, ProjectTeam, RunBranch, TeamDefinition, TeamSource } from "@isotopy/core";
import type { ProjectPath } from "../paths.ts";
import { composeFlowPipeline, teamIssues } from "../domain/rules/team-composition.ts";
import { formatValidationIssues } from "../domain/validation.ts";
import type { ValidationResult } from "../domain/validation.ts";
import { parseTeamFile } from "../schemas/team-file.ts";
import { commitFileOnBranch, commitFileOnCurrentBranch } from "../utils/git-file-commit.ts";
import type { FileCommit } from "../utils/git-file-commit.ts";
import { isRepositoryRoot } from "../utils/git.ts";
import type { Logger } from "../utils/logger.ts";
import { messageOf } from "../utils/message-of.ts";
import { toPosixPath } from "../utils/posix-path.ts";
import { readOptionalText, writeTextFile } from "../utils/text-file.ts";
import type { AgentCatalog } from "./agent-catalog.ts";

const BUNDLED_TEAM = fileURLToPath(new URL("../domain/skills/team/team.md", import.meta.url));

const SEED_MESSAGE = "Isotopy: the project's standing team, from the bundled template";

export function teamChangeMessage(rationale: string): string {
  const [summary = ""] = rationale.trim().split(/\r?\n/);
  return `Isotopy: the team changes — ${summary}`;
}

export class TeamService {
  private readonly logger: Logger;

  constructor(
    private readonly agents: AgentCatalog,
    logger: Logger,
  ) {
    this.logger = logger.child("TeamService");
  }

  async view(projectPath: ProjectPath): Promise<ProjectTeam> {
    const own = await readOptionalText(teamFile(projectPath));
    const source: TeamSource = own === undefined ? "template" : "project";
    const text = own ?? (await bundledTeam());
    const team = await this.validate(projectPath, text);
    return team.ok
      ? { state: "valid", source, text, team: team.value }
      : { state: "invalid", source, text, issues: team.issues.map((issue) => formatValidationIssues([issue])) };
  }

  async flowPipeline(projectPath: ProjectPath, flowId: string): Promise<ValidationResult<PipelineDefinition>> {
    await this.seed(projectPath);
    const team = await this.validate(projectPath, await readFile(teamFile(projectPath), "utf8"));
    if (!team.ok) {
      return { ok: false, issues: team.issues.map((issue) => ({ ...issue, path: ["team.md", ...issue.path] })) };
    }
    return composeFlowPipeline(team.value, flowId, await this.agents.knownIds(projectPath));
  }

  async validate(projectPath: ProjectPath, text: string): Promise<ValidationResult<TeamDefinition>> {
    const parsed = parseTeamFile(text);
    if (!parsed.ok) {
      return parsed;
    }
    const issues = teamIssues(parsed.value, await this.agents.knownIds(projectPath));
    return issues.length === 0 ? parsed : { ok: false, issues };
  }

  async seed(projectPath: ProjectPath): Promise<void> {
    if ((await readOptionalText(teamFile(projectPath))) !== undefined) {
      return;
    }
    await writeTextFile(teamFile(projectPath), await bundledTeam());
    if (await isRepositoryRoot(projectPath.root)) {
      await commitFileOnCurrentBranch(this.commitOf(projectPath, SEED_MESSAGE)).catch((error: unknown) => {
        this.logger.warn(`Seeded ${TEAM_FILE} but could not commit it: ${messageOf(error)}`, { project: projectPath.id });
      });
    }
  }

  async apply(projectPath: ProjectPath, text: string, rationale: string, branch: RunBranch | undefined): Promise<void> {
    await writeTextFile(teamFile(projectPath), text);
    if (!(await isRepositoryRoot(projectPath.root))) {
      return;
    }
    const commit = this.commitOf(projectPath, teamChangeMessage(rationale));
    await commitFileOnCurrentBranch(commit);
    if (branch !== undefined) {
      await commitFileOnBranch(branch.base, commit);
    }
  }

  private commitOf(projectPath: ProjectPath, message: string): FileCommit {
    return {
      root: projectPath.root,
      relativePath: toPosixPath(path.relative(projectPath.root, teamFile(projectPath))),
      message,
    };
  }
}

function teamFile(projectPath: ProjectPath): string {
  return path.join(projectPath.dataDir, TEAM_FILE);
}

function bundledTeam(): Promise<string> {
  return readFile(BUNDLED_TEAM, "utf8");
}
