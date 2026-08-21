import type { ProjectPath } from "../paths.ts";
import { getOrCreate } from "../utils/get-or-create.ts";
import { Database } from "./database.ts";

export class ProjectDatabases {
  private readonly databases = new Map<string, Database>();

  for(projectPath: ProjectPath): Database {
    return getOrCreate(
      this.databases,
      projectPath.id,
      () => new Database(projectPath),
    );
  }

  async settleAll(): Promise<void> {
    await Promise.all([...this.databases.values()].map((db) => db.settle()));
  }
}
