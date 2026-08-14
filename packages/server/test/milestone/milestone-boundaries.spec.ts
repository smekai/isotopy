import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Database } from "../../src/db/database.ts";
import { MilestonesTable } from "../../src/db/milestones-table.ts";
import { parsePersistedMilestone } from "../../src/schemas/milestone.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true, maxRetries: 5 }),
    ),
  );
});

describe("milestone persistence boundaries", () => {
  it("rejects invalid nested milestone data", () => {
    const parsed = parsePersistedMilestone(
      JSON.stringify({
        id: "milestone",
        projectId: "project",
        name: "Milestone",
        status: "active",
        autoRunNext: false,
        features: [{ id: "feature", status: "unknown" }],
        planningRunIds: [],
        createdAt: "2026-07-29T00:00:00.000Z",
        updatedAt: "2026-07-29T00:00:00.000Z",
      }),
    );

    expect(parsed).toBeUndefined();
  });

  it("enforces valid JSON in SQLite", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "isotopy-milestone-db-"));
    roots.push(root);
    const database = new Database({
      id: "project",
      root,
      dataDir: path.join(root, ".isotopy"),
    });
    const table = new MilestonesTable(database);

    await expect(table.upsert("milestone", "not JSON")).rejects.toThrow();
    await database.settle();
  });
});
