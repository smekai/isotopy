import type { ProductManagerCloseout } from "@adhd/core";
import { describe, expect, it } from "vitest";
import {
  renderCancelledCleanupReport,
  renderCleanupReport,
  renderCloseout,
  renderMilestoneSummary,
} from "../src/domain/markdown/closeout.ts";
import {
  renderMilestonePlanningContext,
  renderMilestoneRevisionContext,
  renderPriorMilestoneCloseouts,
} from "../src/domain/markdown/planning.ts";
import { buildStagePrompt } from "../src/domain/markdown/stage.ts";

const CLOSEOUT: ProductManagerCloseout = {
  summary: "Delivered\r\ncleanly.",
  deliveredScope: ["Feature one\nwith details"],
  decisions: ["Keep\nboth lines"],
  knowledge: [],
  findings: [
    {
      id: "finding-1",
      title: "Broken\n title",
      severity: "blocking",
      evidence: "Trace one\nTrace two",
    },
  ],
  tasks: [],
  completedTaskIds: [],
  unresolvedTaskIds: [],
  cleanup: [],
  nextRecommendation: "Ship after review.",
};

describe("artifact Markdown", () => {
  it("renders closeout sections with normalized structure and one terminal newline", () => {
    expect(renderCloseout(CLOSEOUT)).toBe(
      [
        "# Product Manager closeout",
        "",
        "Delivered",
        "cleanly.",
        "",
        "## Delivered scope",
        "",
        "- Feature one",
        "  with details",
        "",
        "## Decisions",
        "",
        "- Keep",
        "  both lines",
        "",
        "## Findings",
        "",
        "- **Blocking · Broken title** — Trace one",
        "  Trace two",
        "",
        "## Next recommendation",
        "",
        "Ship after review.",
        "",
      ].join("\n"),
    );
  });

  it("renders cleanup outcomes and an explicit cancellation report", () => {
    expect(renderCleanupReport({ removed: [], rejected: [] })).toBe(
      "# Cleanup report\n\nNo cleanup paths were requested.\n",
    );
    expect(renderCancelledCleanupReport()).toBe(
      "# Cleanup report\n\n" +
        "Removed the run-owned temporary directory after cancellation. No closeout agent was started.\n",
    );
  });

  it("omits empty milestone sections", () => {
    expect(
      renderMilestoneSummary({
        name: " Release\none ",
        runCount: 2,
        featureCount: 1,
        decisions: [],
        knowledge: [],
        openProblems: [],
      }),
    ).toBe(
      "# Release one — milestone summary\n\nRuns: 2\nFeatures: 1\n",
    );
  });
});

describe("prompt Markdown", () => {
  it("normalizes stage labels and line endings without a trailing newline", () => {
    expect(
      buildStagePrompt(
        "Build\r\nthis",
        [{ label: " Software\n Architect ", output: "Review\r\nnotes\r\n" }],
        " Implement\r\n carefully ",
      ),
    ).toBe(
      "## Step task\n\nImplement\n carefully\n\n" +
        "## Task\n\nBuild\nthis\n\n" +
        "## Handoff from previous steps\n\n" +
        "These are reports from the boxes that ran before you, in order. They describe intent — the working directory is the source of truth. Verify rather than assume.\n\n" +
        "### Software Architect\n\nReview\nnotes",
    );
  });

  it("renders revision and accumulated milestone context deterministically", () => {
    const revision = renderMilestoneRevisionContext(
      "Goal",
      undefined,
      "Change\r\ndirection",
    );
    expect(revision).toBe(
      "## Original milestone goal\n\nGoal\n\n" +
        "## User revision request\n\nChange\ndirection",
    );

    const prior = renderPriorMilestoneCloseouts([
      {
        name: "First\nmilestone",
        decisions: ["Use SQLite"],
        knowledge: [],
        problems: ["Missing trace"],
      },
    ]);
    expect(prior).toBe(
      "## Prior milestone closeouts\n\n" +
        "- First milestone\n" +
        "  - Decision: Use SQLite\n" +
        "  - Open problem: Missing trace",
    );

    expect(
      renderMilestonePlanningContext("Goal", "Board", prior, [
        { name: "Second", findings: ["Issue one", "Issue two"] },
      ]),
    ).toBe(
      "Goal\n\nBoard\n\n" +
        `${prior}\n\n` +
        "## Prior milestone knowledge\n\n" +
        "- Second: Issue one; Issue two",
    );
  });
});
