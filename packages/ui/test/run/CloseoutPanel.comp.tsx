// Component test: the closeout record is the only place a Full Delivery run
// reports what it created and what it refused to clean up. Its documents live
// under the project data dir, not the workspace, so this panel is the only
// surface that shows them — and a section quietly rendering empty would hide a
// finding the run meant to escalate.
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { RunCloseoutRecord, RunState } from "@adhd/core";
import { ArtifactsPanel } from "../../src/components/run/ArtifactsPanel";
import type { ArtifactView } from "../../src/components/run/ArtifactsPanel";
import { CloseoutPanel } from "../../src/components/run/CloseoutPanel";
import { DIRS } from "../../src/theme";
import { run, stage } from "../support/run-fixtures";

vi.mock("../../src/api", () => ({
  fetchRunFiles: vi.fn(() => Promise.resolve({ files: [] })),
  fetchRunFileContent: vi.fn(() => Promise.resolve(null)),
  revealRunFolder: vi.fn(() => Promise.resolve({ path: "C:/work/run-1" })),
}));

const d = DIRS.indigo;

function Artifacts({ subject }: { subject: RunState }) {
  const [view, setView] = useState<ArtifactView>("workflow");
  return (
    <ArtifactsPanel
      run={subject}
      focusedStageId={null}
      view={view}
      d={d}
      onViewChange={setView}
    />
  );
}



afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test("created tasks show their id, title and which backend wrote them", () => {
  // Act
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

  // Assert
  const chips = screen.getAllByTestId("closeout-created-task");
  expect(chips).toHaveLength(2);
  expect(chips[0]?.textContent).toContain("TASK-101");
  expect(chips[0]?.textContent).toContain("Cover the milestone e2e gap");
  expect(chips[0]?.textContent).toContain("TaskPlanner");
  expect(chips[1]?.textContent).toContain("Isotopy");
});

test("a blocking finding is labelled as such and keeps its evidence", () => {
  // Act
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

  // Assert
  expect(screen.getByText("BLOCKING")).toBeDefined();
  expect(screen.getByText("NON-BLOCKING")).toBeDefined();
  expect(screen.getByText(/started feature 3 after feature 2 failed/)).toBeDefined();
});

test("a rejected cleanup path is shown, not silently dropped", () => {
  // Act
  render(
    <CloseoutPanel
      closeout={closeout({
        cleanup: { removed: [".adhd/runs/r1/tmp"], rejected: ["../../etc/hosts"] },
      })}
      d={d}
    />,
  );

  // Assert
  expect(screen.getByText(/Removed \.adhd\/runs\/r1\/tmp/)).toBeDefined();
  expect(screen.getByText(/Rejected \.\.\/\.\.\/etc\/hosts/)).toBeDefined();
});

test("validation errors are surfaced rather than hidden behind a valid-looking report", () => {
  // Act
  render(
    <CloseoutPanel
      closeout={closeout({
        validationErrors: ["Closeout referenced unknown source tasks: TASK-999"],
      })}
      d={d}
    />,
  );

  // Assert
  expect(screen.getByTestId("closeout-validation-errors").textContent).toContain(
    "TASK-999",
  );
});

test("empty sections are omitted entirely, so nothing reads as an empty promise", () => {
  // Act
  render(<CloseoutPanel closeout={closeout()} d={d} />);

  // Assert
  expect(screen.queryByText("Findings")).toBeNull();
  expect(screen.queryByText("Created tasks")).toBeNull();
  expect(screen.queryByText("Cleanup")).toBeNull();
  expect(screen.getByText("Delivered scope")).toBeDefined();
  expect(screen.getByText("Completed source tasks")).toBeDefined();
});

test("Artifacts hides the Closeout view for a run that never produced one", () => {
  // Act
  render(<Artifacts subject={completedRun()} />);

  // Assert
  expect(screen.queryByTestId("artifact-view-closeout")).toBeNull();
});

test("opening the Closeout view from Artifacts shows the report", () => {
  // Arrange
  render(<Artifacts subject={completedRun({ closeout: closeout() })} />);

  // Act
  fireEvent.click(screen.getByTestId("artifact-view-closeout"));

  // Assert
  expect(screen.getByTestId("closeout-panel").textContent).toContain(
    "Shipped the milestone dashboard.",
  );
});

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

function completedRun(overrides: Partial<RunState> = {}): RunState {
  const state = run([stage("implementation", "passed"), stage("closeout", "passed")], "completed");
  state.stageOutputs = { implementation: "DEV HANDOFF" };
  return { ...state, ...overrides };
}
