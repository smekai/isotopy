import type { Orchestration } from "@adhd/core";
import { Database } from "../db/database.ts";
import { OrchestrationsTable } from "../db/orchestrations-table.ts";
import { parsePersistedOrchestration } from "../domain/orchestration.ts";
import type { ProjectPath } from "../paths.ts";

export class OrchestrationRepository {
  private readonly db: Database;
  private readonly orchestrations: OrchestrationsTable;

  constructor(projectPath: ProjectPath) {
    this.db = new Database(projectPath);
    this.orchestrations = new OrchestrationsTable(this.db);
  }

  async write(orchestration: Orchestration): Promise<void> {
    await this.orchestrations.upsert(orchestration.id, JSON.stringify(orchestration));
  }

  async loadAll(): Promise<Orchestration[]> {
    const rows = await this.orchestrations.all();
    return rows.flatMap((data) => {
      const orchestration = parsePersistedOrchestration(data);
      if (orchestration) {
        return [orchestration];
      }
      console.warn("Skipping malformed orchestration row in the project database");
      return [];
    });
  }

  settle(): Promise<void> {
    return this.db.settle();
  }
}
