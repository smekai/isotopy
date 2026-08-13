import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { EMPTY_AUTOMATION_CONFIG } from "@isotopy/core";
import type { ProjectAutomationConfig } from "@isotopy/core";
import {
  automationConfigSchema,
  parseAutomationConfig,
} from "../schemas/automation-file.ts";
import { validate } from "../domain/validation.ts";
import type { ValidationIssue } from "../domain/validation.ts";
import { ensureProjectDataDir } from "../paths.ts";
import type { ProjectPath } from "../paths.ts";

const FILE_NAME = "automation.json";

export class InvalidAutomationConfigError extends Error {
  constructor(readonly issues: ValidationIssue[]) {
    super("Invalid project automation configuration");
  }
}

export function automationConfigPath(project: ProjectPath): string {
  return path.join(project.dataDir, FILE_NAME);
}

export class AutomationConfigStore {
  async get(project: ProjectPath): Promise<ProjectAutomationConfig> {
    let content: string;
    try {
      content = await readFile(automationConfigPath(project), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return structuredClone(EMPTY_AUTOMATION_CONFIG);
      }
      throw error;
    }
    const parsed = parseAutomationConfig(content);
    if (!parsed.ok) {
      throw new InvalidAutomationConfigError(parsed.issues);
    }
    return parsed.value;
  }

  async update(
    project: ProjectPath,
    input: unknown,
  ): Promise<ProjectAutomationConfig> {
    const parsed = validate(automationConfigSchema, input);
    if (!parsed.ok) {
      throw new InvalidAutomationConfigError(parsed.issues);
    }
    await ensureProjectDataDir(project);
    const target = automationConfigPath(project);
    const temporary = `${target}.tmp`;
    await writeFile(temporary, `${JSON.stringify(parsed.value, null, 2)}\n`, "utf8");
    await rename(temporary, target);
    return parsed.value;
  }
}
