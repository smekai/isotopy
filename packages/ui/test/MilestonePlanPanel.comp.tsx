import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { defaultProjectPreferences } from "@adhd/core";
import type { Milestone, RunState } from "@adhd/core";
import {
  approveMilestonePlan,
  fetchMilestone,
  reviseMilestonePlan,
  updateMilestoneProposal,
} from "../src/api";
import { MilestonePlanPanel } from "../src/components/run/MilestonePlanPanel";
import type { SettingsController } from "../src/hooks/useSettings";
import { DIRS } from "../src/theme";

vi.mock("../src/api", () => ({
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

test("the generated proposal is editable, approvable, and revisable", async () => {
  vi.mocked(fetchMilestone).mockResolvedValue(milestone);
  vi.mocked(updateMilestoneProposal).mockImplementation(async (_id, edited) => ({
    ...milestone,
    name: edited.name,
    goal: edited.goal,
    proposal: { ...proposal, ...edited, revision: 2 },
  }));
  vi.mocked(approveMilestonePlan).mockResolvedValue({
    ...milestone,
    status: "active",
  });
  vi.mocked(reviseMilestonePlan).mockResolvedValue({ ...run, id: "r2" });
  const onRunStarted = vi.fn();
  render(
    <MilestonePlanPanel
      run={run}
      d={DIRS.indigo}
      settings={settings}
      onRunStarted={onRunStarted}
    />,
  );
  const name = await screen.findByLabelText("Milestone name");
  fireEvent.change(name, { target: { value: "Edited milestone" } });

  fireEvent.change(screen.getByLabelText("Revision request"), {
    target: { value: "Split the UI task" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Request AI revision" }));
  await waitFor(() => expect(reviseMilestonePlan).toHaveBeenCalled());
  await waitFor(() => expect(onRunStarted).toHaveBeenCalledWith("r2"));

  fireEvent.click(screen.getByTestId("approve-milestone-plan"));
  await waitFor(() =>
    expect(updateMilestoneProposal).toHaveBeenCalledWith(
      "m1",
      expect.objectContaining({ name: "Edited milestone" }),
    ),
  );
  await waitFor(() => expect(approveMilestonePlan).toHaveBeenCalledWith("m1"));
});
