import { ActiveRunsTable } from "../../src/db/active-runs-table.ts";
import { ProjectDatabases } from "../../src/db/project-databases.ts";
import type { ProjectRegistry } from "../../src/services/project-registry.ts";
import { RecordingLogger } from "./recording-logger.ts";

export async function activeRunOf(
  registry: ProjectRegistry,
  projectId: string,
): Promise<string | undefined> {
  const databases = new ProjectDatabases(new RecordingLogger());
  const active = new ActiveRunsTable(databases.for(registry.resolve(projectId)));
  const current = await active.current(projectId);
  await databases.settleAll();
  return current;
}
