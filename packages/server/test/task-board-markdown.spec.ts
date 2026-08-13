import { describe, expect, it } from "vitest";
import {
  existingTaskIdForMarker,
  insertTaskSection,
  nextTaskNumber,
  renderTaskBoardPlanningContext,
  renderTaskSection,
  renderWorkLogEntry,
  takeTaskSection,
  taskIdsIn,
} from "../src/domain/markdown/task-board.ts";

describe("Task board Markdown", () => {
  it("renders normalized structure while preserving the description body", () => {
    expect(
      renderTaskSection({
        id: " TASK-101 ",
        title: "Repair\n  milestone   planning",
        priority: "P1",
        tags: [" server ", "testing"],
        updatedAt: "2026-07-29 16:00",
        description: "\r\nFirst paragraph.\r\n\r\n- keep this list\r\n",
        source: "milestone  one\n feature two",
        marker: "<!-- ADHD-FINDING:abc -->",
      }),
    ).toBe(
      [
        "## TASK-101: Repair milestone planning",
        "**Priority:** P1 | **Tags:** server, testing",
        "**Updated:** 2026-07-29 16:00",
        "",
        "First paragraph.",
        "",
        "- keep this list",
        "",
        "**Isotopy source:** milestone one feature two",
        "<!-- ADHD-FINDING:abc -->",
        "",
        "---",
        "",
      ].join("\n"),
    );
  });

  it("preserves CRLF and unrelated board bytes when inserting at the top", () => {
    const original =
      "# Backlog\r\n\r\n<!-- keep -->\r\n## TASK-001: Existing\r\n\r\n---\r\n";
    const section = renderTaskSection({
      id: "TASK-002",
      title: "New",
      priority: "P2",
      tags: [],
      updatedAt: "2026-07-29 16:00",
      description: "Body",
      source: "run one",
      marker: "<!-- ADHD-FINDING:def -->",
    });
    const result = insertTaskSection(original, section, "top");

    expect(result).not.toMatch(/(?<!\r)\n/);
    expect(result).toContain("## TASK-002: New\r\n");
    expect(result).toContain(
      "<!-- keep -->\r\n## TASK-001: Existing\r\n\r\n---\r\n",
    );
  });

  it("takes CRLF task sections without rewriting surrounding content", () => {
    const before = "# Backlog\r\n\r\n<!-- before -->\r\n";
    const section =
      "## TASK-010: Move me\r\n**Priority:** P1\r\n\r\nBody\r\n\r\n---\r\n";
    const after = "\r\n<!-- after -->\r\n## TASK-011: Stay\r\n\r\n---\r\n";

    expect(takeTaskSection(`${before}${section}${after}`, "TASK-010")).toEqual({
      text: `${before}${after}`,
      section,
    });
  });

  it("discovers tasks, markers, and the next available number", () => {
    const first =
      "# Backlog\n\n## TASK-004: Existing\n<!-- ADHD-FINDING:abc -->\n\n---\n";
    const second = "# Done\n\n## TASK-009: Finished\n\n---\n";

    expect(taskIdsIn([first, second])).toEqual(
      new Set(["TASK-004", "TASK-009"]),
    );
    expect(existingTaskIdForMarker(first, "<!-- ADHD-FINDING:abc -->")).toBe(
      "TASK-004",
    );
    expect(nextTaskNumber("TASK", 7, `${first}\n${second}`)).toBe(10);
  });

  it("renders planning context and work-log entries deterministically", () => {
    expect(
      renderTaskBoardPlanningContext("taskplanner", [
        {
          name: "Backlog",
          content:
            "# Backlog\r\n\r\n## TASK-004: Existing\r\n**Priority:** P1\r\n\r\nDescription.\r\n\r\n---\r\n",
        },
        { name: "Done", content: "# Done\r\n" },
      ]),
    ).toBe(
      "Existing taskplanner tasks:\nBacklog:\n- TASK-004: Existing — Description.",
    );
    expect(renderWorkLogEntry("TASK-004", "2026-07-29", "run-1")).toBe(
      "## TASK-004 — 2026-07-29\n" +
        "**What:** Completed by Full Delivery run run-1.\n" +
        "**Outcome:** Evidence and follow-ups are recorded in the Product Manager closeout.\n\n" +
        "---\n",
    );
  });
});
