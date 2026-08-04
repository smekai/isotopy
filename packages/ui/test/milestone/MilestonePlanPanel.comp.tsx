// Component test: the panel is where a generated plan stops being the model's
// and becomes the user's. Both paths out of it spend money or mint tasks — an
// AI revision starts a fresh planning run, approval writes the task board — so
// what matters is that each button reaches exactly the endpoint it claims to,
// carrying the edits currently on screen.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { defaultProjectPreferences } from "@adhd/core";
import type { Milestone, RunState } from "@adhd/core";
import {
  approveMilestonePlan,
  fetchMilestone,
  reviseMilestonePlan,
  updateMilestoneProposal,
} from "../../src/api";
import { MilestonePlanPanel } from "../../src/components/run/MilestonePlanPanel";
import type { SettingsController } from "../../src/hooks/useSettings";
import { DIRS } from "../../src/theme";

vi.mock("../../src/api", () => ({
  fetchMilestone: vi.fn(),
  updateMilestoneProposal: vi.fn(),
  approveMilestonePlan: vi.fn(),
  reviseMilestonePlan: vi.fn(),
}));

const proposal = {
  revision: 1,
  name: "Milestone D",
  goal: "Ship planning",
  createdAt: "2026-07-29T00:00:00.000Z",
  features: [
    {
      id: "planner",
      title: "Planner",
      description: "Plan work",
      acceptanceCriteria: ["Editable"],
      existingTaskIds: [],
      taskDrafts: [
        {
          id: "task",
          title: "Build planner",
          description: "Implement it",
          priority: "P0" as const,
          tags: ["ui"],
        },
      ],
    },
  ],
};

const milestone: Milestone = {
  id: "m1",
  projectId: "home",
  name: proposal.name,
  goal: proposal.goal,
  status: "draft",
  autoRunNext: false,
  features: [],
  planningRunIds: ["r1"],
  proposal,
  createdAt: proposal.createdAt,
  updatedAt: proposal.createdAt,
};

const run: RunState = {
  id: "r1",
  number: 1,
  projectId: "home",
  milestoneId: milestone.id,
  pipelineId: "milestone-planning",
  pipelineName: "Milestone planning",
  status: "completed",
  stages: [{ id: "milestone-plan", label: "Product Manager", status: "passed", logs: [] }],
  messages: [],
  createdAt: proposal.createdAt,
};

const settings: SettingsController = {
  view: null,
  preferences: defaultProjectPreferences(),
  ready: true,
  error: null,
  update: vi.fn(),
  updateConnection: vi.fn(),
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});





test("requesting an AI revision starts a new planning run and reports its id", async () => {
  // Anticipate
  anticipateLoadedProposal();
  anticipateRevisionRun();
  const { onRunStarted } = await renderLoadedPanel();
  fireEvent.change(screen.getByLabelText("Revision request"), {
    target: { value: "Split the UI task" },
  });

  // Act
  fireEvent.click(screen.getByRole("button", { name: "Request AI revision" }));

  // Assert
  await waitFor(() => expect(reviseMilestonePlan).toHaveBeenCalled());
  await waitFor(() => expect(onRunStarted).toHaveBeenCalledWith("r2"));
});

test("approving saves the edits made to the form before it approves", async () => {
  // Anticipate
  anticipateLoadedProposal();
  anticipateProposalSave();
  anticipateApproval();
  await renderLoadedPanel();
  fireEvent.change(screen.getByLabelText("Milestone name"), {
    target: { value: "Edited milestone" },
  });

  // Act
  fireEvent.click(screen.getByTestId("approve-milestone-plan"));

  // Assert — approving an unsaved edit would activate the wrong plan.
  await waitFor(() =>
    expect(updateMilestoneProposal).toHaveBeenCalledWith(
      "m1",
      expect.objectContaining({ name: "Edited milestone" }),
    ),
  );
  await waitFor(() => expect(approveMilestonePlan).toHaveBeenCalledWith("m1"));
});

/** One anticipation per endpoint the panel can reach — none of them branch. */
function anticipateLoadedProposal(): void {
  vi.mocked(fetchMilestone).mockResolvedValue(milestone);
}

function anticipateProposalSave(): void {
  vi.mocked(updateMilestoneProposal).mockImplementation(async (_id, edited) => ({
    ...milestone,
    name: edited.name,
    goal: edited.goal,
    proposal: { ...proposal, ...edited, revision: 2 },
  }));
}

function anticipateApproval(): void {
  vi.mocked(approveMilestonePlan).mockResolvedValue({ ...milestone, status: "active" });
}

function anticipateRevisionRun(): void {
  vi.mocked(reviseMilestonePlan).mockResolvedValue({ ...run, id: "r2" });
}

/** Render the panel and wait for the loaded proposal to reach the form. */
async function renderLoadedPanel(
  onRunStarted = vi.fn(),
): Promise<{ onRunStarted: ReturnType<typeof vi.fn> }> {
  render(
    <MilestonePlanPanel
      run={run}
      d={DIRS.indigo}
      settings={settings}
      onRunStarted={onRunStarted}
    />,
  );
  await screen.findByLabelText("Milestone name");
  return { onRunStarted };
}
