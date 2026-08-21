import type { CloseoutReport } from "@isotopy/core";
import { describe, expect, it, test } from "vitest";
import {
  renderCancelledCleanupReport,
  renderCleanupReport,
  renderCloseout,
  renderCloseoutBody,
  renderMilestoneSummary,
} from "../src/domain/markdown/closeout.ts";
import {
  renderMilestonePlanningContext,
  renderMilestoneRevisionContext,
  renderPriorMilestoneCloseouts,
} from "../src/domain/markdown/planning.ts";
import {
  STAGE_NOTES_INVITATION,
  buildContinuationPrompt,
  buildStagePrompt,
} from "../src/domain/markdown/stage.ts";
import { renderGatePreference } from "../src/domain/markdown/orchestration.ts";

const CLOSEOUT: CloseoutReport = {
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
        "# Run closeout",
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

  it("renders an embedded closeout without its own title, under the caller's level", () => {
    expect(renderCloseoutBody(CLOSEOUT, "###")).toBe(
      [
        "Delivered",
        "cleanly.",
        "",
        "### Delivered scope",
        "",
        "- Feature one",
        "  with details",
        "",
        "### Decisions",
        "",
        "- Keep",
        "  both lines",
        "",
        "### Findings",
        "",
        "- **Blocking · Broken title** — Trace one",
        "  Trace two",
        "",
        "### Next recommendation",
        "",
        "Ship after review.",
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
        "### Software Architect\n\nReview\nnotes\n\n" +
        STAGE_NOTES_INVITATION,
    );
  });

  it("replays every exchange after the original assignment when a session cannot be resumed", () => {
    expect(
      buildContinuationPrompt({
        task: "Build\r\nthis",
        upstream: [],
        stepTask: "Implement carefully",
        exchanges: [
          {
            output: "Started.\r\n",
            question: "Which database?",
            answer: "Postgres",
          },
          { question: "Which table?", answer: "settings" },
        ],
      }),
    ).toBe(
      "## Step task\n\nImplement carefully\n\n" +
        "## Task\n\nBuild\nthis\n\n" +
        "## Conversation so far\n\n" +
        "You already worked on this stage and stopped to ask. Your CLI cannot resume its own session, so the exchange is replayed below. Continue from it — do not start the stage over.\n\n" +
        "### Your turn 1 response\n\nStarted.\n\n" +
        "### What you asked on turn 1\n\nWhich database?\n\n" +
        "### The answer you were given\n\nPostgres\n\n" +
        "### What you asked on turn 2\n\nWhich table?\n\n" +
        "### The answer you were given\n\nsettings\n\n" +
        STAGE_NOTES_INVITATION,
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

test("a gate preference names the pipeline, because the same stage is gated in one and not another", () => {
  const rendered = renderGatePreference({
    "full-delivery:intake": true,
    "pm-dev-test:intake": false,
  });

  expect(rendered).toContain("Approval wanted after: `full-delivery:intake`.");
  expect(rendered).toContain("Approval waived after: `pm-dev-test:intake`.");
});

test("a project with no gate overrides gives the Orchestrator nothing to read", () => {
  expect(renderGatePreference({})).toBeUndefined();
});
