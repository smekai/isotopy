import { readFile, readdir, stat } from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { UNKNOWN_AGENT_GLYPH } from "@isotopy/core";
import type { AgentOrigin } from "@isotopy/core";
import { agentsDir, packsFile, stepsDir } from "../paths.ts";
import type { ProjectPath } from "../paths.ts";
import { withoutFrontMatter } from "../domain/markdown/front-matter.ts";
import { composeSkill } from "../domain/markdown/skill.ts";
import type { KnowledgeEntry } from "../domain/markdown/skill.ts";
import { knownAgentIds, mergeCatalog } from "../domain/rules/agent-catalog.ts";
import type {
  AgentCatalogSnapshot,
  CatalogDuty,
  CatalogPersona,
  CatalogStep,
  KnownAgentIds,
} from "../domain/rules/agent-catalog.ts";
import { SKILL_ID } from "../domain/rules/persona-notes.ts";
import { formatValidationIssues } from "../domain/validation.ts";
import type { ValidationResult } from "../domain/validation.ts";
import {
  parseAgentFile,
  parseDutyFile,
  parseKnowledgeFile,
  parseStepFile,
} from "../schemas/agent-definition.ts";
import { errorCodeOf } from "../utils/error-code.ts";
import type { Logger } from "../utils/logger.ts";
import { toPosixPath } from "../utils/posix-path.ts";
import { readPackRecords } from "./pack-records.ts";
import { personaNotesPath, projectSkillAddendumPath, userSkillFilePath } from "./skills.ts";

const BUNDLED_PERSONAS = fileURLToPath(new URL("../domain/skills/personas/", import.meta.url));

const BUNDLED_STEPS = fileURLToPath(new URL("../domain/skills/step-tasks/", import.meta.url));

const BUNDLED_DUTIES = fileURLToPath(new URL("../domain/skills/duties/", import.meta.url));

const AGENT_FILE = "agent.md";

const KNOWLEDGE_DIR = "knowledge";

const DUTIES_DIR = "duties";

const MARKDOWN = ".md";

const ABSENT_FILE_CODES = new Set(["ENOENT", "ENOTDIR"]);

interface DefinitionFile {
  id: string;
  file: string;
}

export interface ComposedPersona {
  text: string;
  warnings: string[];
}

interface LibraryBook {
  entry: KnowledgeEntry;
  warning?: string;
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
      this.readPersonas(await markdownFilesIn(BUNDLED_PERSONAS), () => "bundled"),
      this.readSteps(await markdownFilesIn(BUNDLED_STEPS), () => "bundled"),
    ]);
    return { personas, steps };
  }

  async catalog(projectPath: ProjectPath): Promise<AgentCatalogSnapshot> {
    const [bundled, folders, stepFiles, packed] = await Promise.all([
      this.bundled(),
      this.agentFolders(projectPath),
      markdownFilesIn(stepsDir(projectPath)),
      this.packedFiles(projectPath),
    ]);
    const originOf = (file: string): AgentOrigin => (packed.has(file) ? "pack" : "project");
    const [personas, steps] = await Promise.all([
      this.readPersonas(folders, (id) => originOf(`agents/${id}/${AGENT_FILE}`)),
      this.readSteps(stepFiles, (id) => originOf(`steps/${id}${MARKDOWN}`)),
    ]);
    await this.reportFoldersWithoutAgent(folders, bundled);
    return mergeCatalog(bundled, { personas, steps });
  }

  async duties(projectPath: ProjectPath): Promise<CatalogDuty[]> {
    const [bundledFiles, catalog] = await Promise.all([
      markdownFilesIn(BUNDLED_DUTIES),
      this.catalog(projectPath),
    ]);
    const [bundled, ...brought] = await Promise.all([
      this.readDuties(bundledFiles, (key) => key),
      ...catalog.personas.map(async ({ id }) =>
        this.readDuties(
          await markdownFilesIn(path.join(agentsDir(projectPath), id, DUTIES_DIR)),
          (key) => `${id}/${key}`,
        ),
      ),
    ]);
    return [...bundled, ...brought.flat()];
  }

  async knownIds(projectPath: ProjectPath): Promise<KnownAgentIds> {
    return knownAgentIds(await this.catalog(projectPath));
  }

  async persona(projectPath: ProjectPath, id: string): Promise<ComposedPersona | undefined> {
    if (!SKILL_ID.test(id)) {
      return undefined;
    }
    const [catalog, library, userOverride, projectAddendum, accumulatedNotes] = await Promise.all([
      this.catalog(projectPath),
      this.libraryOf(projectPath, id),
      this.textOf(userSkillFilePath(id)),
      this.textOf(projectSkillAddendumPath(projectPath, id)),
      this.textOf(personaNotesPath(projectPath, id)),
    ]);
    const entry = catalog.personas.find((persona) => persona.id === id);
    const text = composeSkill({
      base: entry?.origin === "project" ? entry.body : bodyOf(userOverride) ?? entry?.body,
      knowledge: library.map((book) => book.entry),
      projectAddendum,
      accumulatedNotes,
    });
    return text === undefined
      ? undefined
      : { text, warnings: library.flatMap((book) => book.warning ?? []) };
  }

  async stepTask(projectPath: ProjectPath, id: string): Promise<string | undefined> {
    const catalog = await this.catalog(projectPath);
    return catalog.steps.find((step) => step.id === id)?.body;
  }

  private async libraryOf(projectPath: ProjectPath, id: string): Promise<LibraryBook[]> {
    const files = await markdownFilesIn(path.join(agentsDir(projectPath), id, KNOWLEDGE_DIR));
    return Promise.all(
      files.map(async ({ file }) => {
        const shown = toPosixPath(file);
        const parsed = parseKnowledgeFile((await this.textOf(file)) ?? "");
        return parsed.ok
          ? { entry: { path: shown, description: parsed.value.description } }
          : {
              entry: { path: shown },
              warning: `Reference file ${shown} is listed without a description: ${formatValidationIssues(parsed.issues)}`,
            };
      }),
    );
  }

  private async agentFolders(projectPath: ProjectPath): Promise<DefinitionFile[]> {
    const root = agentsDir(projectPath);
    const folders = (await entriesOf(root)).filter((entry) => entry.isDirectory());
    return folders.map((entry) => ({
      id: entry.name,
      file: path.join(root, entry.name, AGENT_FILE),
    }));
  }

  private async packedFiles(projectPath: ProjectPath): Promise<Set<string>> {
    const records = await readPackRecords(projectPath);
    if (!records.ok) {
      this.reportOnce(
        packsFile(projectPath),
        `Ignoring ${packsFile(projectPath)}: ${formatValidationIssues(records.issues)}`,
      );
      return new Set();
    }
    return new Set(records.value.flatMap((record) => record.files.map((file) => file.path)));
  }

  private readPersonas(
    files: DefinitionFile[],
    originOf: (id: string) => AgentOrigin,
  ): Promise<CatalogPersona[]> {
    return this.readDefinitions(files, parseAgentFile, (definition) => ({
      id: definition.id,
      title: definition.title,
      glyph: definition.glyph ?? UNKNOWN_AGENT_GLYPH,
      description: definition.description,
      origin: originOf(definition.id),
      body: definition.body,
    }));
  }

  private readSteps(
    files: DefinitionFile[],
    originOf: (id: string) => AgentOrigin,
  ): Promise<CatalogStep[]> {
    return this.readDefinitions(files, parseStepFile, (definition) => ({
      ...definition,
      origin: originOf(definition.id),
    }));
  }

  private readDuties(
    files: DefinitionFile[],
    keyOf: (fileId: string) => string,
  ): Promise<CatalogDuty[]> {
    return this.readDefinitions(
      files,
      (_id, source) => parseDutyFile(source),
      (definition, id) => ({ key: keyOf(id), ...definition }),
    );
  }

  private async readDefinitions<Definition, Entry>(
    files: DefinitionFile[],
    parse: (id: string, source: string) => ValidationResult<Definition>,
    toEntry: (definition: Definition, id: string) => Entry,
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
        return toEntry(parsed.value, id);
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
    .sort((left, right) => left.name.localeCompare(right.name))
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
