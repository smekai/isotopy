// Component test: the three tabs are the run's body now that StageFocusPanel is
// gone, so the contract worth guarding is that each tab shows its own thing —
// and that the chat never shows what the log is for. Rendering is the only way
// to see that, because the filter and the tab switch meet in the markup.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { LogLevel, RunState, StageState, StageStatus } from "@adhd/core";
import { RunTabs } from "../src/components/run/RunTabs";
import { DIRS } from "../src/theme";
import { run, stage } from "./support/run-fixtures";

vi.mock("../src/api", () => ({
  fetchRunFiles: vi.fn(() => Promise.resolve({ files: [] })),
  fetchRunFileContent: vi.fn(() => Promise.resolve(null)),
}));

const d = DIRS.indigo;

function log(ts: string, level: LogLevel, message: string) {
  return { ts, level, message };
}

function started(id: string, status: StageStatus, logs: StageState["logs"]): StageState {
  return { ...stage(id, status), startedAt: "2026-07-27T10:00:00.000Z", logs };
}

const DEV_PROSE = "I added the toggle.";
const TOOL_ROW = "Read src/theme.ts";
const CHATTER = "Developer online · Claude Code · haiku";

function runWithTwoStages(): RunState {
  const state = run(
    [
      started("implementation", "passed", [
        log("2026-07-27T10:00:01.000Z", "run", CHATTER),
        log("2026-07-27T10:00:02.000Z", "info", DEV_PROSE),
        log("2026-07-27T10:00:03.000Z", "run", TOOL_ROW),
      ]),
      started("test", "passed", [log("2026-07-27T10:01:00.000Z", "info", "Checked it.")]),
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
  renderTabs(runWithTwoStages());

  const thread = screen.getByTestId("chat-thread");
  expect(within(thread).getByText(DEV_PROSE)).toBeDefined();
  expect(within(thread).queryByText(TOOL_ROW)).toBeNull();
  expect(within(thread).queryByText(CHATTER)).toBeNull();
});

test("the log holds exactly what the chat refuses to show", () => {
  renderTabs(runWithTwoStages());

  fireEvent.click(screen.getByTestId("run-tab-logs"));

  const logs = screen.getByTestId("stage-scroll");
  expect(within(logs).getByText(TOOL_ROW)).toBeDefined();
  expect(within(logs).getByText(CHATTER)).toBeDefined();
  expect(within(logs).getByText(DEV_PROSE)).toBeDefined();
});

test("the log shows every stage, and one stage when a node is focused", () => {
  const { rerender } = renderTabs(runWithTwoStages());
  fireEvent.click(screen.getByTestId("run-tab-logs"));

  expect(screen.getAllByTestId("stage-profession").map((el) => el.textContent)).toEqual([
    "Developer",
    "QA Engineer",
  ]);

  rerender(
    <RunTabs
      run={runWithTwoStages()}
      focusedStageId="test"
      sending={false}
      d={d}
      onSend={vi.fn()}
      onClearFocus={vi.fn()}
    />,
  );

  expect(screen.getAllByTestId("stage-profession").map((el) => el.textContent)).toEqual([
    "QA Engineer",
  ]);
});

test("artifacts list every stage's handoff, not just the last one's", () => {
  renderTabs(runWithTwoStages());

  fireEvent.click(screen.getByTestId("run-tab-artifacts"));

  expect(screen.getByText("implementation/handoff.md")).toBeDefined();
  expect(screen.getByText("test/handoff.md")).toBeDefined();
  expect(screen.getByTestId("artifact-preview").textContent).toBe("DEV HANDOFF");

  fireEvent.click(screen.getByText("test/handoff.md"));
  expect(screen.getByTestId("artifact-preview").textContent).toBe("TESTER HANDOFF");
});

test("the solution folder is one click away when the run has a workspace", () => {
  const state = { ...runWithTwoStages(), workspacePath: "C:/work/run-1" };
  renderTabs(state);

  fireEvent.click(screen.getByTestId("run-tab-artifacts"));
  fireEvent.click(screen.getByTestId("artifact-view-files"));

  expect(screen.getByTestId("artifact-files")).toBeDefined();
});

test("a run with no workspace offers no solution folder toggle", () => {
  renderTabs(runWithTwoStages());

  fireEvent.click(screen.getByTestId("run-tab-artifacts"));

  expect(screen.queryByTestId("artifact-view-files")).toBeNull();
});
