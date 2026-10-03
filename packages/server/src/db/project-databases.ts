import type { ProjectPath } from "../paths.ts";
import type { Logger } from "../utils/logger.ts";
import { getOrCreate } from "../utils/get-or-create.ts";
import { Database } from "./database.ts";

export class ProjectDatabases {
  private readonly databases = new Map<string, Database>();

  constructor(private readonly logger: Logger) {}

  for(projectPath: ProjectPath): Database {
    return getOrCreate(
      this.databases,
      projectPath.id,
      () => new Database(projectPath, this.logger),
    );
  }

  async settleAll(): Promise<void> {
    await Promise.all([...this.databases.values()].map((db) => db.settle()));
  }
}
