import { readFile, readdir, stat } from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { UNKNOWN_AGENT_GLYPH } from "@isotopy/core";
import type { AgentOrigin } from "@isotopy/core";
import { agentsDir, stepsDir } from "../paths.ts";
import type { ProjectPath } from "../paths.ts";
import { withoutFrontMatter } from "../domain/markdown/front-matter.ts";
import { composeSkill } from "../domain/markdown/skill.ts";
import { knownAgentIds, mergeCatalog } from "../domain/rules/agent-catalog.ts";
import type {
  AgentCatalogSnapshot,
  CatalogPersona,
  CatalogStep,
  KnownAgentIds,
} from "../domain/rules/agent-catalog.ts";
import { SKILL_ID } from "../domain/rules/persona-notes.ts";
import { formatValidationIssues } from "../domain/validation.ts";
import type { ValidationResult } from "../domain/validation.ts";
import { parseAgentFile, parseStepFile } from "../schemas/agent-definition.ts";
import { errorCodeOf } from "../utils/error-code.ts";
import type { Logger } from "../utils/logger.ts";
import { personaNotesPath, projectSkillAddendumPath, userSkillFilePath } from "./skills.ts";

const BUNDLED_PERSONAS = fileURLToPath(new URL("../domain/skills/personas/", import.meta.url));

const BUNDLED_STEPS = fileURLToPath(new URL("../domain/skills/step-tasks/", import.meta.url));

const AGENT_FILE = "agent.md";

const MARKDOWN = ".md";

const ABSENT_FILE_CODES = new Set(["ENOENT", "ENOTDIR"]);

interface DefinitionFile {
  id: string;
  file: string;
}

interface CachedText {
  mtimeMs: number;
  size: number;
  text: string;
}

export class AgentCatalog {
  private readonly logger: Logger;
  private readonly texts = new Map<string, CachedText>();
  private readonly reported = new Set<string>();

  constructor(logger: Logger) {
    this.logger = logger.child("AgentCatalog");
  }

  async bundled(): Promise<AgentCatalogSnapshot> {
    const [personas, steps] = await Promise.all([
      this.readPersonas(await markdownFilesIn(BUNDLED_PERSONAS), "bundled"),
      this.readSteps(await markdownFilesIn(BUNDLED_STEPS), "bundled"),
    ]);
    return { personas, steps };
  }

  async catalog(projectPath: ProjectPath): Promise<AgentCatalogSnapshot> {
    const [bundled, folders, stepFiles] = await Promise.all([
      this.bundled(),
      this.agentFolders(projectPath),
      markdownFilesIn(stepsDir(projectPath)),
    ]);
    const [personas, steps] = await Promise.all([
      this.readPersonas(folders, "project"),
      this.readSteps(stepFiles, "project"),
    ]);
    await this.reportFoldersWithoutAgent(folders, bundled);
    return mergeCatalog(bundled, { personas, steps });
  }

  async knownIds(projectPath: ProjectPath): Promise<KnownAgentIds> {
    return knownAgentIds(await this.catalog(projectPath));
  }

  async persona(projectPath: ProjectPath, id: string): Promise<string | undefined> {
    if (!SKILL_ID.test(id)) {
      return undefined;
    }
    const [catalog, userOverride, projectAddendum, accumulatedNotes] = await Promise.all([
      this.catalog(projectPath),
      this.textOf(userSkillFilePath(id)),
      this.textOf(projectSkillAddendumPath(projectPath, id)),
      this.textOf(personaNotesPath(projectPath, id)),
    ]);
    const entry = catalog.personas.find((persona) => persona.id === id);
    return composeSkill({
      base: entry?.origin === "project" ? entry.body : bodyOf(userOverride) ?? entry?.body,
      projectAddendum,
      accumulatedNotes,
    });
  }

  async stepTask(projectPath: ProjectPath, id: string): Promise<string | undefined> {
    const catalog = await this.catalog(projectPath);
    return catalog.steps.find((step) => step.id === id)?.body;
  }

  private async agentFolders(projectPath: ProjectPath): Promise<DefinitionFile[]> {
    const root = agentsDir(projectPath);
    const folders = (await entriesOf(root)).filter((entry) => entry.isDirectory());
    return folders.map((entry) => ({
      id: entry.name,
      file: path.join(root, entry.name, AGENT_FILE),
    }));
  }

  private readPersonas(files: DefinitionFile[], origin: AgentOrigin): Promise<CatalogPersona[]> {
    return this.readDefinitions(files, parseAgentFile, (definition) => ({
      id: definition.id,
      title: definition.title,
      glyph: definition.glyph ?? UNKNOWN_AGENT_GLYPH,
      description: definition.description,
      origin,
      body: definition.body,
    }));
  }

  private readSteps(files: DefinitionFile[], origin: AgentOrigin): Promise<CatalogStep[]> {
    return this.readDefinitions(files, parseStepFile, (definition) => ({
      ...definition,
      origin,
    }));
  }

  private async readDefinitions<Definition, Entry>(
    files: DefinitionFile[],
    parse: (id: string, source: string) => ValidationResult<Definition>,
    toEntry: (definition: Definition) => Entry,
  ): Promise<Awaited<Entry>[]> {
    const entries = await Promise.all(
      files.map(async ({ id, file }) => {
        const cached = await this.cachedText(file);
        if (cached === undefined) {
          return undefined;
        }
        const parsed = parse(id, cached.text);
        if (!parsed.ok) {
          this.reportOnce(
            `${file}@${cached.mtimeMs}`,
            `Skipped ${file}: ${formatValidationIssues(parsed.issues)}`,
          );
          return undefined;
        }
        return toEntry(parsed.value);
      }),
    );
    return entries.filter((entry): entry is Awaited<Entry> => entry !== undefined);
  }

  private async reportFoldersWithoutAgent(
    folders: DefinitionFile[],
    bundled: AgentCatalogSnapshot,
  ): Promise<void> {
    const bundledIds = new Set(bundled.personas.map((persona) => persona.id));
    for (const folder of folders.filter(({ id }) => !bundledIds.has(id))) {
      if ((await this.cachedText(folder.file)) === undefined) {
        this.reportOnce(
          folder.file,
          `Skipped ${path.dirname(folder.file)}: it has no ${AGENT_FILE} and names no bundled agent`,
        );
      }
    }
  }

  private async textOf(file: string): Promise<string | undefined> {
    return (await this.cachedText(file))?.text;
  }

  private async cachedText(file: string): Promise<CachedText | undefined> {
    const stats = await stat(file).catch(absentAsUndefined);
    if (stats === undefined || !stats.isFile()) {
      return undefined;
    }
    const cached = this.texts.get(file);
    if (cached?.mtimeMs === stats.mtimeMs && cached.size === stats.size) {
      return cached;
    }
    const fresh = { mtimeMs: stats.mtimeMs, size: stats.size, text: await readFile(file, "utf8") };
    this.texts.set(file, fresh);
    return fresh;
  }

  private reportOnce(key: string, message: string): void {
    if (this.reported.has(key)) {
      return;
    }
    this.reported.add(key);
    this.logger.warn(message);
  }
}

async function markdownFilesIn(directory: string): Promise<DefinitionFile[]> {
  const entries = await entriesOf(directory);
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(MARKDOWN))
    .map((entry) => ({
      id: entry.name.slice(0, -MARKDOWN.length),
      file: path.join(directory, entry.name),
    }));
}

async function entriesOf(directory: string): Promise<Dirent[]> {
  return (await readdir(directory, { withFileTypes: true }).catch(absentAsUndefined)) ?? [];
}

function absentAsUndefined(error: unknown): undefined {
  if (ABSENT_FILE_CODES.has(errorCodeOf(error) ?? "")) {
    return undefined;
  }
  throw error;
}

function bodyOf(text: string | undefined): string | undefined {
  return text === undefined ? undefined : withoutFrontMatter(text);
}
