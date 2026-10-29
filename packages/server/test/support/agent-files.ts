// Generators for the agent and step files a project brings under `.isotopy/`.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export interface AgentFileFields {
  id: string;
  title: string;
  glyph: string;
  description: string;
  body: string;
}

export interface StepFileFields {
  id: string;
  description: string;
  body: string;
}

export function agentFile(overrides: Partial<AgentFileFields> = {}): string {
  const title = overrides.title ?? "Growth Marketer";
  return frontMatter(
    {
      name: overrides.id ?? "growth-marketer",
      title,
      glyph: overrides.glyph ?? "✶",
      description: overrides.description ?? "Finds the people a product is for.",
    },
    overrides.body ?? `# Role: ${title}\n\nYou find the people a product is for.`,
  );
}

export function stepFile(overrides: Partial<StepFileFields> = {}): string {
  return frontMatter(
    {
      name: overrides.id ?? "plan-campaign",
      description: overrides.description ?? "Plan one campaign for one audience.",
    },
    overrides.body ?? "# Assignment: Plan a campaign\n\nPick one audience and one channel.",
  );
}

export async function writeProjectAgent(
  dataDir: string,
  overrides: Partial<AgentFileFields> = {},
): Promise<string> {
  const file = path.join(dataDir, "agents", overrides.id ?? "growth-marketer", "agent.md");
  await writeText(file, agentFile(overrides));
  return file;
}

export async function writeProjectStep(
  dataDir: string,
  overrides: Partial<StepFileFields> = {},
): Promise<string> {
  const file = path.join(dataDir, "steps", `${overrides.id ?? "plan-campaign"}.md`);
  await writeText(file, stepFile(overrides));
  return file;
}

export interface DutyFileFields {
  agent: string;
  key: string;
  title: string;
  cron: string;
  timezone: string;
  flow?: string;
  task: string;
}

export function dutyFile(overrides: Partial<DutyFileFields> = {}): string {
  const fields: Record<string, string> = {
    title: overrides.title ?? "Weekly metrics",
    cron: overrides.cron ?? "0 8 * * 1",
    timezone: overrides.timezone ?? "UTC",
  };
  const flow = overrides.flow === undefined ? [] : [`flow: ${overrides.flow}`];
  return [
    "---",
    ...Object.entries(fields).map(([key, value]) => `${key}: ${JSON.stringify(value)}`),
    ...flow,
    "---",
    overrides.task ?? "Read last week's numbers and propose the next experiment.",
  ].join("\n");
}

export async function writeProjectDuty(
  dataDir: string,
  overrides: Partial<DutyFileFields> = {},
): Promise<string> {
  const file = path.join(
    dataDir,
    "agents",
    overrides.agent ?? "growth-marketer",
    "duties",
    `${overrides.key ?? "weekly-metrics"}.md`,
  );
  await writeText(file, dutyFile(overrides));
  return file;
}

export async function writeText(file: string, content: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
}

function frontMatter(fields: Record<string, string>, body: string): string {
  const lines = Object.entries(fields).map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  return ["---", ...lines, "---", body].join("\n");
}
