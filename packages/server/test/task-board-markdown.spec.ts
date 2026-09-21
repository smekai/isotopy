// Reading and writing a board file is TaskPlanner's, and its own round-trip specs
// cover it. What earns a spec here is the digest — how Isotopy states a board, and its
// two skip reasons, to the agent reading it.
import { Priority } from "@smekai/taskplanner";
import type { Task } from "@smekai/taskplanner";
import { describe, expect, it } from "vitest";
import {
  renderBoardDigest,
  renderWorkLogEntry,
} from "../src/domain/markdown/task-board.ts";

const TODAY = new Date("2026-09-10T12:00:00.000Z");

describe("Task board Markdown", () => {
  it("renders a digest of what each state holds", () => {
    expect(
      renderBoardDigest(
        "taskplanner",
        [
          { name: "Backlog", tasks: [task({ description: "Description." })] },
          { name: "Done", tasks: [] },
        ],
        TODAY,
      ),
    ).toBe("Existing taskplanner tasks:\nBacklog:\n- TASK-004: Existing [P1] — Description.");
  });

  // The mark the owner writes was invisible to the reader this replaces: it dropped
  // every `**`-prefixed line before the Orchestrator saw a task.
  it("says an assigned task is not the team's to start, and who holds it", () => {
    const digest = renderBoardDigest(
      "taskplanner",
      [{ name: "Next", tasks: [task({ assignee: "owner" })] }],
      TODAY,
    );

    expect(digest).toContain("assigned to @owner — theirs to start, not the team's");
  });

  it("gives a date-blocked task a different reason from an assigned one", () => {
    const digest = renderBoardDigest(
      "taskplanner",
      [{ name: "Next", tasks: [task({ waitingUntil: "2026-12-01" })] }],
      TODAY,
    );

    expect(digest).toContain("blocked until 2026-12-01 on something outside the repository");
  });

  it("does not mark a waiting date that has already arrived", () => {
    const digest = renderBoardDigest(
      "taskplanner",
      [{ name: "Next", tasks: [task({ waitingUntil: "2026-01-01" })] }],
      TODAY,
    );

    expect(digest).not.toContain("blocked until");
  });

  it("says the board is empty rather than listing nothing", () => {
    expect(renderBoardDigest("isotopy", [{ name: "Backlog", tasks: [] }], TODAY)).toBe(
      "The isotopy task board is empty.",
    );
  });

  it("renders work-log entries deterministically", () => {
    expect(renderWorkLogEntry("TASK-004", "2026-07-29", "run-1")).toBe(
      "## TASK-004 — 2026-07-29\n" +
        "**What:** Completed by Full Delivery run run-1.\n" +
        "**Outcome:** Evidence and follow-ups are recorded in the run closeout.\n\n" +
        "---\n",
    );
  });
});

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "TASK-004",
    title: "Existing",
    description: "",
    priority: Priority.P1,
    tags: [],
    ...overrides,
  };
}
