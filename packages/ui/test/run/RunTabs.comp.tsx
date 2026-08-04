// Component test: the three tabs are the run's body now that StageFocusPanel is
// gone, so the contract worth guarding is that each tab shows its own thing —
// and that the chat never shows what the log is for. Rendering is the only way
// to see that, because the filter and the tab switch meet in the markup.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { RunState } from "@adhd/core";
import { RunTabs } from "../../src/components/run/RunTabs";
import { DIRS } from "../../src/theme";
import { log, run, started } from "../support/run-fixtures";

vi.mock("../../src/api", () => ({
  fetchRunFiles: vi.fn(() => Promise.resolve({ files: [] })),
  fetchRunFileContent: vi.fn(() => Promise.resolve(null)),
}));

const d = DIRS.indigo;

const STARTED_AT = "2026-07-27T10:00:00.000Z";
const DEV_PROSE = "I added the toggle.";
const TOOL_ROW = "Read src/theme.ts";
const CHATTER = "Developer online · Claude Code · haiku";

function runWithTwoStages(): RunState {
  const state = run(
    [
      started("implementation", "passed", STARTED_AT, [
        log("2026-07-27T10:00:01.000Z", "run", CHATTER, {
          kind: "engine",
          name: "Claude Code",
        }),
        log("2026-07-27T10:00:02.000Z", "info", DEV_PROSE),
        log("2026-07-27T10:00:03.000Z", "run", TOOL_ROW, {
          kind: "tool",
          name: "Read",
          detail: "src/theme.ts",
        }),
      ]),
      started("test", "passed", STARTED_AT, [
        log("2026-07-27T10:01:00.000Z", "info", "Checked it."),
      ]),
    ],
    "completed",
  );
  state.stageOutputs = { implementation: "DEV HANDOFF", test: "TESTER HANDOFF" };
  return state;
}

function renderTabs(state: RunState, focusedStageId: string | null = null) {
  return render(
    <RunTabs
      run={state}
      focusedStageId={focusedStageId}
      sending={false}
      d={d}
      onSend={vi.fn()}
      onClearFocus={vi.fn()}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test("the run opens on the chat, which carries prose but not machinery", () => {
  // Act
  renderTabs(runWithTwoStages());

  // Assert
  const thread = screen.getByTestId("chat-thread");
  expect(within(thread).getByText(DEV_PROSE)).toBeDefined();
  expect(within(thread).queryByText(TOOL_ROW)).toBeNull();
  expect(within(thread).queryByText(CHATTER)).toBeNull();
});

test("the log holds exactly what the chat refuses to show", () => {
  // Arrange
  renderTabs(runWithTwoStages());

  // Act
  fireEvent.click(screen.getByTestId("run-tab-logs"));

  // Assert
  const logs = screen.getByTestId("stage-scroll");
  expect(within(logs).getByText(TOOL_ROW)).toBeDefined();
  expect(within(logs).getByText(CHATTER)).toBeDefined();
  expect(within(logs).getByText(DEV_PROSE)).toBeDefined();
});

test("the log shows every stage when nothing is focused", () => {
  // Arrange
  renderTabs(runWithTwoStages());

  // Act
  fireEvent.click(screen.getByTestId("run-tab-logs"));

  // Assert
  expect(screen.getAllByTestId("stage-profession").map((el) => el.textContent)).toEqual([
    "Developer",
    "QA Engineer",
  ]);
});

test("focusing a node narrows the log to that stage alone", () => {
  // Arrange
  renderTabs(runWithTwoStages(), "test");

  // Act
  fireEvent.click(screen.getByTestId("run-tab-logs"));

  // Assert
  expect(screen.getAllByTestId("stage-profession").map((el) => el.textContent)).toEqual([
    "QA Engineer",
  ]);
});

test("artifacts list every stage's handoff, not just the last one's", () => {
  // Arrange
  renderTabs(runWithTwoStages());

  // Act
  fireEvent.click(screen.getByTestId("run-tab-artifacts"));

  // Assert
  expect(screen.getByText("implementation/handoff.md")).toBeDefined();
  expect(screen.getByText("test/handoff.md")).toBeDefined();
  expect(screen.getByTestId("artifact-preview").textContent).toBe("DEV HANDOFF");
});

test("picking a different handoff swaps the preview", () => {
  // Arrange
  renderTabs(runWithTwoStages());
  fireEvent.click(screen.getByTestId("run-tab-artifacts"));

  // Act
  fireEvent.click(screen.getByText("test/handoff.md"));

  // Assert
  expect(screen.getByTestId("artifact-preview").textContent).toBe("TESTER HANDOFF");
});

test("the solution folder is one click away when the run has a workspace", () => {
  // Arrange
  renderTabs({ ...runWithTwoStages(), workspacePath: "C:/work/run-1" });
  fireEvent.click(screen.getByTestId("run-tab-artifacts"));

  // Act
  fireEvent.click(screen.getByTestId("artifact-view-files"));

  // Assert
  expect(screen.getByTestId("artifact-files")).toBeDefined();
});

test("a run with no workspace offers no solution folder toggle", () => {
  // Arrange
  renderTabs(runWithTwoStages());

  // Act
  fireEvent.click(screen.getByTestId("run-tab-artifacts"));

  // Assert
  expect(screen.queryByTestId("artifact-view-files")).toBeNull();
});
