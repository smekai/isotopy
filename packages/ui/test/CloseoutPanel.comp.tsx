// Component test: the closeout record is the only place a Full Delivery run
// reports what it created and what it refused to clean up. Its documents live
// under the project data dir, not the workspace, so this panel is the only
// surface that shows them — and a section quietly rendering empty would hide a
// finding the run meant to escalate.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { RunCloseoutRecord, RunState } from "@adhd/core";
import { ArtifactsPanel } from "../src/components/run/ArtifactsPanel";
import { CloseoutPanel } from "../src/components/run/CloseoutPanel";
import { DIRS } from "../src/theme";
import { run, stage } from "./support/run-fixtures";

vi.mock("../src/api", () => ({
  fetchRunFiles: vi.fn(() => Promise.resolve({ files: [] })),
  fetchRunFileContent: vi.fn(() => Promise.resolve(null)),
}));

const d = DIRS.indigo;

function closeout(overrides: Partial<RunCloseoutRecord> = {}): RunCloseoutRecord {
  return {
    report: {
      summary: "Shipped the milestone dashboard.",
      deliveredScope: ["Milestone route", "Autorun toggle"],
      decisions: ["Kept the composer untouched"],
      knowledge: ["Milestones have no SSE channel"],
      findings: [],
      tasks: [],
      completedTaskIds: ["TASK-093"],
      unresolvedTaskIds: ["TASK-094"],
      cleanup: [],
    },
    createdTasks: [],
    cleanup: { removed: [], rejected: [] },
    validationErrors: [],
    completedAt: "2026-07-31T00:00:00.000Z",
    ...overrides,
  };
}

function completedRun(record?: RunCloseoutRecord): RunState {
  const state = run([stage("implementation", "passed"), stage("closeout", "passed")], "completed");
  state.stageOutputs = { implementation: "DEV HANDOFF" };
  if (record) {
    state.closeout = record;
  }
  return state;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test("created tasks show their id, title and which backend wrote them", () => {
  render(
    <CloseoutPanel
      closeout={closeout({
        createdTasks: [
          { id: "TASK-101", title: "Cover the milestone e2e gap", backend: "taskplanner" },
          { id: "adhd-3", title: "Chase the flaky teardown", backend: "adhd" },
        ],
      })}
      d={d}
    />,
  );

  const chips = screen.getAllByTestId("closeout-created-task");
  expect(chips).toHaveLength(2);
  expect(chips[0]?.textContent).toContain("TASK-101");
  expect(chips[0]?.textContent).toContain("Cover the milestone e2e gap");
  expect(chips[0]?.textContent).toContain("TaskPlanner");
  expect(chips[1]?.textContent).toContain("ADHD");
});

test("a blocking finding is labelled as such and keeps its evidence", () => {
  render(
    <CloseoutPanel
      closeout={closeout({
        report: {
          ...closeout().report,
          findings: [
            {
              id: "x1",
              title: "Autorun chains past a failure",
              severity: "blocking",
              evidence: "run #7 started feature 3 after feature 2 failed",
            },
            { id: "x2", title: "Copy could be clearer", severity: "non_blocking" },
          ],
        },
      })}
      d={d}
    />,
  );

  expect(screen.getByText("BLOCKING")).toBeDefined();
  expect(screen.getByText("NON-BLOCKING")).toBeDefined();
  expect(screen.getByText(/started feature 3 after feature 2 failed/)).toBeDefined();
});

test("a rejected cleanup path is shown, not silently dropped", () => {
  render(
    <CloseoutPanel
      closeout={closeout({
        cleanup: { removed: [".adhd/runs/r1/tmp"], rejected: ["../../etc/hosts"] },
      })}
      d={d}
    />,
  );

  expect(screen.getByText(/Removed \.adhd\/runs\/r1\/tmp/)).toBeDefined();
  expect(screen.getByText(/Rejected \.\.\/\.\.\/etc\/hosts/)).toBeDefined();
});

test("validation errors are surfaced rather than hidden behind a valid-looking report", () => {
  render(
    <CloseoutPanel
      closeout={closeout({
        validationErrors: ["Closeout referenced unknown source tasks: TASK-999"],
      })}
      d={d}
    />,
  );

  expect(screen.getByTestId("closeout-validation-errors").textContent).toContain(
    "TASK-999",
  );
});

test("empty sections are omitted entirely, so nothing reads as an empty promise", () => {
  render(<CloseoutPanel closeout={closeout()} d={d} />);

  expect(screen.queryByText("Findings")).toBeNull();
  expect(screen.queryByText("Created tasks")).toBeNull();
  expect(screen.queryByText("Cleanup")).toBeNull();
  expect(screen.getByText("Delivered scope")).toBeDefined();
  expect(screen.getByText("Completed source tasks")).toBeDefined();
});

test("Artifacts offers the Closeout view only for a run that produced one", () => {
  render(<ArtifactsPanel run={completedRun()} focusedStageId={null} d={d} />);
  expect(screen.queryByTestId("artifact-view-closeout")).toBeNull();

  cleanup();
  render(
    <ArtifactsPanel run={completedRun(closeout())} focusedStageId={null} d={d} />,
  );

  fireEvent.click(screen.getByTestId("artifact-view-closeout"));
  expect(screen.getByTestId("closeout-panel").textContent).toContain(
    "Shipped the milestone dashboard.",
  );
});
