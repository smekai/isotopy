// Component test: a stage's spend is what tells a user which box cost what. The
// engines differ — Claude Code reports dollars, Codex only tokens, Cursor neither —
// so the log header shows whichever the stage actually reported.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import type { StageUsage } from "@isotopy/core";
import { LogsPanel } from "../../src/components/run/LogsPanel";
import type { LogsPanelProps } from "../../src/components/run/LogsPanel";
import { DIRS } from "../../src/theme";
import { run, started } from "../support/run-fixtures";

const STARTED_AT = "2026-07-21T12:00:00.000Z";

afterEach(() => {
  cleanup();
});

test("dollar spend shows cents, and a sub-cent spend keeps four decimals", () => {
  // Act
  render(<LogsPanel {...logsProps([{ costUsd: 0.1423 }, { costUsd: 0.0042 }])} />);

  // Assert
  expect(screen.getByText("$0.14")).toBeTruthy();
  expect(screen.getByText("$0.0042")).toBeTruthy();
});

test("an engine that counts only tokens shows tokens, abbreviated past a thousand", () => {
  // Act
  render(
    <LogsPanel
      {...logsProps([
        { tokensIn: 12_300, tokensOut: 4100 },
        { tokensIn: 840, tokensOut: 120 },
      ])}
    />,
  );

  // Assert
  expect(screen.getByText("12.3k in · 4.1k out")).toBeTruthy();
  expect(screen.getByText("840 in · 120 out")).toBeTruthy();
});

test("dollars win over tokens when a stage reports both", () => {
  // Act
  render(<LogsPanel {...logsProps([{ costUsd: 0.5, tokensIn: 12_300, tokensOut: 4100 }])} />);

  // Assert
  expect(screen.getByText("$0.50")).toBeTruthy();
  expect(screen.queryByText(/in · /)).toBeNull();
});

test("a stage that reports neither dollars nor tokens shows no spend, not a confident zero", () => {
  // Act
  render(<LogsPanel {...logsProps([{ turns: 2, durationMs: 900 }])} />);

  // Assert
  expect(screen.queryByText(/\$/)).toBeNull();
  expect(screen.queryByText(/in · /)).toBeNull();
});

function logsProps(usages: StageUsage[]): LogsPanelProps {
  const stages = usages.map((usage, index) => ({
    ...started(`stage-${index}`, "passed", STARTED_AT),
    usage,
  }));
  return { run: run(stages, "completed"), focusedStageId: null, d: DIRS.indigo };
}
