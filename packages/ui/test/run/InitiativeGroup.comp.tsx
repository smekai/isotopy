// Component test: TASK-141's dogfood showed three runs of one initiative stacked as
// three unrelated cards. The group is what makes them one thing — so what it has to
// prove is the relationship, not the styling: whose goal these runs serve, and why a
// later run exists at all.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { InitiativeGroup } from "../../src/components/InitiativeGroup";
import { DIRS } from "../../src/theme";
import { orchestratedRun, orchestration } from "../support/orchestration-fixtures";

afterEach(() => {
  cleanup();
});

const CONVERSATION = orchestratedRun("conversation", "2026-08-01T09:00:00.000Z");
const FIX = orchestratedRun("fix", "2026-08-01T12:00:01.000Z");

const INITIATIVE = orchestration({
  goal: "Evolve this focus timer into one I would use every day",
  runIds: ["conversation", "fix"],
  turns: [
    {
      runId: "conversation",
      at: "2026-08-01T12:00:00.000Z",
      decision: {
        action: "start_run",
        rationale: "Run two failed on accessibility.",
        task: "Announce the timer state.",
      },
    },
  ],
});

function renderGroup(collapsed = false) {
  return render(
    <InitiativeGroup
      orchestration={INITIATIVE}
      runs={[CONVERSATION, FIX]}
      collapsed={collapsed}
      selectedRunId={null}
      d={DIRS.indigo}
      onToggle={() => {}}
      onOpen={() => {}}
      onRestart={() => {}}
      onRerun={() => {}}
    />,
  );
}

test("the header names the goal its runs serve", () => {
  // Arrange & Act
  renderGroup();

  // Assert
  expect(screen.getByTestId("initiative-goal").textContent).toBe(
    "Evolve this focus timer into one I would use every day",
  );
});

test("a later run says why it exists", () => {
  // Arrange & Act
  renderGroup();

  // Assert
  expect(screen.getByTestId("run-reason-fix").textContent).toContain(
    "Run two failed on accessibility.",
  );
});

test("the run an initiative began as claims no reason, because no decision started it", () => {
  // Arrange & Act
  renderGroup();

  // Assert
  expect(screen.queryByTestId("run-reason-conversation")).toBeNull();
});

test("collapsing hides the runs while keeping the initiative on the rail", () => {
  // Arrange & Act
  renderGroup(true);

  // Assert
  expect(screen.queryByTestId("run-card")).toBeNull();
  expect(screen.getByTestId("initiative-goal")).not.toBeNull();
});

test("the header reports how many runs the initiative is holding", () => {
  // Arrange & Act
  renderGroup(true);

  // Assert — the count has to survive collapsing; it is the only thing left saying there is more.
  expect(screen.getByTestId("initiative-count").textContent).toBe("2");
});

test("the header toggles the group", () => {
  // Arrange
  let toggled = 0;
  render(
    <InitiativeGroup
      orchestration={INITIATIVE}
      runs={[CONVERSATION, FIX]}
      collapsed={false}
      selectedRunId={null}
      d={DIRS.indigo}
      onToggle={() => {
        toggled += 1;
      }}
      onOpen={() => {}}
      onRestart={() => {}}
      onRerun={() => {}}
    />,
  );

  // Act
  fireEvent.click(screen.getByTestId("initiative-toggle"));

  // Assert
  expect(toggled).toBe(1);
});
