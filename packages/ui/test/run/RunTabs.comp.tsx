// Component test: the three tabs are the run's body now that StageFocusPanel is
// gone, so the contract worth guarding is that each tab shows its own thing —
// and that the chat never shows what the log is for. Rendering is the only way
// to see that, because the filter and the tab switch meet in the markup.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { ORCHESTRATION_PIPELINE } from "@adhd/core";
import type { ProductProcessStatus, RunState } from "@adhd/core";
import { RunTabs } from "../../src/components/run/RunTabs";
import type { RunTabsProps } from "../../src/components/run/RunTabs";
import type { ProductController } from "../../src/hooks/useProduct";
import { DIRS } from "../../src/theme";
import {
  orchestratedRun,
  orchestration,
  team,
} from "../support/orchestration-fixtures";
import { changes, log, run, started } from "../support/run-fixtures";

vi.mock("../../src/api", () => ({
  fetchRunFiles: vi.fn(() => Promise.resolve({ files: [] })),
  fetchRunFileContent: vi.fn(() => Promise.resolve(null)),
  revealRunFolder: vi.fn(() => Promise.resolve({ path: "C:/work/run-1" })),
}));

const d = DIRS.indigo;

const STARTED_AT = "2026-07-27T10:00:00.000Z";
const DEV_PROSE = "I added the toggle.";
const TOOL_ROW = "Read src/theme.ts";
const CHATTER = "Developer online · Claude Code · haiku";



afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test("the run opens on the chat, which carries prose but not machinery", () => {
  // Act
  render(<RunTabs {...tabsProps()} />);

  // Assert
  const thread = screen.getByTestId("chat-thread");
  expect(within(thread).getByText(DEV_PROSE)).toBeDefined();
  expect(within(thread).queryByText(TOOL_ROW)).toBeNull();
  expect(within(thread).queryByText(CHATTER)).toBeNull();
});

test("a project that never said how to start itself gets no Preview tab to disappoint them with", () => {
  // Act
  render(
    <RunTabs
      {...tabsProps({ product: productController({ state: "stopped", configured: false }) })}
    />,
  );

  // Assert
  expect(screen.queryByTestId("run-tab-preview")).toBeNull();
});

test("a project with a start command earns a Preview tab beside the other three", () => {
  // Arrange
  render(
    <RunTabs
      {...tabsProps({ product: productController({ state: "stopped", configured: true }) })}
    />,
  );

  // Act
  fireEvent.click(screen.getByTestId("run-tab-preview"));

  // Assert
  expect(screen.getByTestId("product-preview")).toBeDefined();
});

test("the log holds exactly what the chat refuses to show", () => {
  // Arrange
  render(<RunTabs {...tabsProps()} />);

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
  render(<RunTabs {...tabsProps()} />);

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
  render(<RunTabs {...tabsProps({ focusedStageId: "test" })} />);

  // Act
  fireEvent.click(screen.getByTestId("run-tab-logs"));

  // Assert
  expect(screen.getAllByTestId("stage-profession").map((el) => el.textContent)).toEqual([
    "QA Engineer",
  ]);
});

test("artifacts list every stage's handoff, not just the last one's", () => {
  // Arrange
  render(<RunTabs {...tabsProps()} />);

  // Act
  fireEvent.click(screen.getByTestId("run-tab-artifacts"));

  // Assert
  expect(screen.getByText("implementation/handoff.md")).toBeDefined();
  expect(screen.getByText("test/handoff.md")).toBeDefined();
  expect(screen.getByTestId("artifact-preview").textContent).toBe("DEV HANDOFF");
});

test("picking a different handoff swaps the preview", () => {
  // Arrange
  render(<RunTabs {...tabsProps()} />);
  fireEvent.click(screen.getByTestId("run-tab-artifacts"));

  // Act
  fireEvent.click(screen.getByText("test/handoff.md"));

  // Assert
  expect(screen.getByTestId("artifact-preview").textContent).toBe("TESTER HANDOFF");
});

test("the solution folder is one click away when the run has a workspace", () => {
  // Arrange
  render(<RunTabs {...tabsProps({ run: { ...runWithTwoStages(), workspacePath: "C:/work/run-1" } })} />);
  fireEvent.click(screen.getByTestId("run-tab-artifacts"));

  // Act
  fireEvent.click(screen.getByTestId("artifact-view-files"));

  // Assert
  expect(screen.getByTestId("artifact-files")).toBeDefined();
});

test("a run with no workspace offers no solution folder toggle", () => {
  // Arrange
  render(<RunTabs {...tabsProps()} />);

  // Act
  fireEvent.click(screen.getByTestId("run-tab-artifacts"));

  // Assert
  expect(screen.queryByTestId("artifact-view-files")).toBeNull();
});

test("an orchestration run opens on the Orchestrator, not the chat", () => {
  // Act
  render(<RunTabs {...tabsProps(orchestrationOverrides())} />);

  // Assert
  expect(screen.getByTestId("orchestrator-panel")).toBeDefined();
  expect(screen.queryByTestId("chat-thread")).toBeNull();
});

test("the awaited team is offered for approval alongside the initiative's runs", () => {
  // Act
  render(<RunTabs {...tabsProps(orchestrationOverrides())} />);

  // Assert
  expect(screen.getByTestId("orchestrator-team").textContent).toContain("Delivery trio");
  expect(screen.getByTestId("approve-team")).toBeDefined();
  expect(screen.getAllByTestId("orchestrator-run").map((el) => el.dataset.runId)).toEqual([
    "earlier",
    "later",
  ]);
});

test("approving the team reports the decision rather than acting on it", () => {
  // Arrange
  const props = tabsProps(orchestrationOverrides());
  render(<RunTabs {...props} />);

  // Act
  fireEvent.click(screen.getByTestId("approve-team"));

  // Assert
  expect(props.orchestrator?.onApprove).toHaveBeenCalledTimes(1);
});

test("the Orchestrator opens even though its orchestration lands after the run does", () => {
  // Arrange — App feeds RunTabs from two independent loads: the run arrives on
  // its own SSE subscription, the orchestration on a separate fetch. The run
  // almost always wins, so the tab is mounted before there is anything to put
  // in it.
  const { orchestrator, ...runOnly } = orchestrationOverrides();
  const { rerender } = render(<RunTabs {...tabsProps(runOnly)} />);

  // Act
  rerender(<RunTabs {...tabsProps({ ...runOnly, orchestrator })} />);

  // Assert
  expect(screen.getByTestId("orchestrator-panel")).toBeDefined();
});

test("a finished run says what it changed where the composer used to apologise", () => {
  // Act
  render(<RunTabs {...tabsProps({ run: changedRun() })} />);

  // Assert
  const result = screen.getByTestId("run-result");
  expect(result.textContent).toContain("1 created · 1 edited");
  expect(result.textContent).not.toContain("start a new run to say more");
});

test("a run that touched nothing keeps the plain finished sentence", () => {
  // Act
  render(<RunTabs {...tabsProps()} />);

  // Assert
  expect(screen.getByTestId("run-result").textContent).toContain(
    "start a new run to say more",
  );
});

test("see what was built opens the changed files without hunting through tabs", () => {
  // Arrange
  render(<RunTabs {...tabsProps({ run: changedRun() })} />);

  // Act
  fireEvent.click(screen.getByText("See what was built"));

  // Assert
  expect(screen.getByTestId("artifact-changes")).toBeDefined();
});

test("the artifacts of a finished run open on what changed, not on the handoffs", () => {
  // Arrange
  render(<RunTabs {...tabsProps({ run: changedRun() })} />);

  // Act
  fireEvent.click(screen.getByTestId("run-tab-artifacts"));

  // Assert
  expect(screen.getByTestId("artifact-changes")).toBeDefined();
});

test("a run with no change set is offered no What changed view", () => {
  // Arrange
  render(<RunTabs {...tabsProps()} />);

  // Act
  fireEvent.click(screen.getByTestId("run-tab-artifacts"));

  // Assert
  expect(screen.queryByTestId("artifact-view-changes")).toBeNull();
});

test("an ordinary run is given no Orchestrator tab to open", () => {
  // Act
  render(<RunTabs {...tabsProps()} />);

  // Assert
  expect(screen.queryByTestId("run-tab-team")).toBeNull();
});

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

function changedRun(): RunState {
  return { ...runWithTwoStages(), workspacePath: "C:/work/run-1", changes: changes() };
}

function orchestrationOverrides(): Partial<RunTabsProps> {
  const awaiting = orchestration({
    status: "awaiting_approval",
    runIds: ["earlier", "later"],
    latestDecision: {
      action: "propose_team",
      rationale: "Small scope.",
      team: team({ name: "Delivery trio" }),
    },
  });
  return {
    run: { ...runWithTwoStages(), pipelineId: ORCHESTRATION_PIPELINE.id },
    orchestrator: {
      orchestration: awaiting,
      runs: [
        orchestratedRun("earlier", "2026-08-01T09:00:00.000Z"),
        orchestratedRun("later", "2026-08-01T12:00:00.000Z"),
      ],
      busy: false,
      roleTiers: {},
      onRoleTierChange: vi.fn(),
      onApprove: vi.fn(),
      onStop: vi.fn(),
      onOpenRun: vi.fn(),
    },
  };
}

function productController(
  status: ProductProcessStatus | null,
): ProductController {
  return {
    status,
    error: null,
    busy: false,
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    restart: vi.fn().mockResolvedValue(undefined),
  };
}

function tabsProps(overrides: Partial<RunTabsProps> = {}): RunTabsProps {
  return {
    run: runWithTwoStages(),
    focusedStageId: null,
    sending: false,
    d,
    onSend: vi.fn(),
    onClearFocus: vi.fn(),
    ...overrides,
  };
}
