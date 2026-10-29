// Component test: a run that released through a pull request records where the
// work went — the PR, its CI result and the merge commit. The run view is the
// only place the owner sees that without opening GitHub.
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { RunPullRequest, RunState } from "@isotopy/core";
import { ArtifactsPanel } from "../../src/components/run/ArtifactsPanel";
import type { ArtifactView } from "../../src/components/run/ArtifactsPanel";
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
    <ArtifactsPanel run={subject} focusedStageId={null} view={view} d={d} onViewChange={setView} />
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test("a run that never opened a pull request has no Pull request view", () => {
  // Act
  render(<Artifacts subject={releaseRun()} />);

  // Assert
  expect(screen.queryByTestId("artifact-view-pull-request")).toBeNull();
});

test("a merged pull request shows its link and the merge commit", () => {
  // Arrange
  render(
    <Artifacts
      subject={releaseRun({ pullRequest: pullRequest({ ci: "passed", mergeCommit: "4d3c2b1a" }) })}
    />,
  );

  // Act
  fireEvent.click(screen.getByTestId("artifact-view-pull-request"));

  // Assert
  expect(screen.getByRole("link", { name: PR_URL })).toBeTruthy();
  expect(screen.getByTestId("pull-request-merge-commit").textContent).toBe("4d3c2b1a");
});

test("a red pull request names the checks that failed", () => {
  // Arrange
  render(
    <Artifacts
      subject={releaseRun({
        pullRequest: pullRequest({ ci: "failed", failingChecks: ["lint", "test"] }),
      })}
    />,
  );

  // Act
  fireEvent.click(screen.getByTestId("artifact-view-pull-request"));

  // Assert
  expect(screen.getByTestId("pull-request-ci").textContent).toContain("lint, test");
  expect(screen.queryByTestId("pull-request-merge-commit")).toBeNull();
});

const PR_URL = "https://github.com/acme/shop/pull/7";

function pullRequest(overrides: Partial<RunPullRequest> = {}): RunPullRequest {
  return { url: PR_URL, ...overrides };
}

function releaseRun(overrides: Partial<RunState> = {}): RunState {
  const state = run([stage("pull-request", "passed")], "completed");
  return { ...state, pipelineId: "release", ...overrides };
}
