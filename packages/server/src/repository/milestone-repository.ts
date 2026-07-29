import type { Milestone } from "@adhd/core";
import { Database } from "../db/database.ts";
import { MilestonesTable } from "../db/milestones-table.ts";
import type { ProjectPath } from "../paths.ts";

function parseMilestone(data: string): Milestone | undefined {
  try {
    const value = JSON.parse(data) as Partial<Milestone>;
    return typeof value.id === "string" &&
      typeof value.projectId === "string" &&
      Array.isArray(value.features)
      ? (value as Milestone)
      : undefined;
  } catch {
    return undefined;
  }
}

export class MilestoneRepository {
  private readonly db: Database;
  private readonly milestones: MilestonesTable;

  constructor(projectPath: ProjectPath) {
    this.db = new Database(projectPath);
    this.milestones = new MilestonesTable(this.db);
  }

  async write(milestone: Milestone): Promise<void> {
    await this.milestones.upsert(milestone.id, JSON.stringify(milestone));
  }

  async loadAll(): Promise<Milestone[]> {
    const rows = await this.milestones.all();
    return rows.flatMap((data) => {
      const milestone = parseMilestone(data);
      if (milestone) {
        return [milestone];
      }
      console.warn("Skipping malformed milestone row in the project database");
      return [];
    });
  }

  settle(): Promise<void> {
    return this.db.settle();
  }
}
