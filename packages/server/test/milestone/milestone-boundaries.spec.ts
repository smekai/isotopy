import { describe, expect, it } from "vitest";
import { milestoneSchema } from "@isotopy/core";
import { parsePersistedRecord } from "../../src/schemas/persisted-record.ts";

describe("milestone persistence boundaries", () => {
  it("rejects invalid nested milestone data", () => {
    const parsed = parsePersistedRecord(
      milestoneSchema,
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
});
