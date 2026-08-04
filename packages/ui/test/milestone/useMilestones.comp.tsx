// Component test: milestones have no SSE channel, so the hook's whole contract
// is when it refetches and what it does with a mutation's response. Both are
// invisible from the outside — only the render sequence shows them.
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Milestone } from "@adhd/core";
import {
  fetchMilestones,
  finalizeMilestone,
  startNextMilestoneRun,
  updateMilestone,
} from "../../src/api";
import { useMilestones } from "../../src/hooks/useMilestones";
import { deferred } from "../support/deferred";
import { feature, MILESTONE_ID, milestone } from "../support/milestone-fixtures";

vi.mock("../../src/api", () => ({
  fetchMilestones: vi.fn(),
  updateMilestone: vi.fn(),
  startNextMilestoneRun: vi.fn(),
  finalizeMilestone: vi.fn(),
}));

const listed = vi.mocked(fetchMilestones);
const patched = vi.mocked(updateMilestone);
const started = vi.mocked(startNextMilestoneRun);
const finalized = vi.mocked(finalizeMilestone);

const READY = milestone([feature("f1", "ready")]);

beforeEach(() => {
  listed.mockResolvedValue([READY]);
});

afterEach(() => {
  vi.clearAllMocks();
});



test("loads the project's milestones and reports ready", async () => {
  // Act
  const { result } = renderMilestones();

  // Assert
  await waitFor(() => expect(result.current.ready).toBe(true));
  expect(result.current.milestones).toEqual([READY]);
  expect(result.current.error).toBeNull();
});

test("stays inert until projects are ready, so no request races the project header", () => {
  // Act
  renderHook(() => useMilestones("home", false, ""));

  // Assert
  expect(listed).not.toHaveBeenCalled();
});

test("an unchanged refresh key does not refetch", async () => {
  // Arrange
  const { rerender, result } = renderMilestones("r1:running");
  await waitFor(() => expect(result.current.ready).toBe(true));

  // Act
  rerender({ key: "r1:running" });

  // Assert — refetching on every render would hammer the server as runs stream.
  expect(listed).toHaveBeenCalledTimes(1);
});

test("a milestone run changing status refetches the list", async () => {
  // Arrange
  const { rerender, result } = renderMilestones("r1:running");
  await waitFor(() => expect(result.current.ready).toBe(true));

  // Act
  rerender({ key: "r1:completed" });

  // Assert
  await waitFor(() => expect(listed).toHaveBeenCalledTimes(2));
});

test("a toggled autorun replaces that milestone with the server's copy", async () => {
  // Anticipate
  const enabled: Milestone = { ...READY, autoRunNext: true };
  patched.mockResolvedValue(enabled);

  // Arrange
  const { result } = renderMilestones();
  await waitFor(() => expect(result.current.ready).toBe(true));

  // Act
  await result.current.setAutoRunNext(MILESTONE_ID, true);

  // Assert
  expect(patched).toHaveBeenCalledWith(MILESTONE_ID, { autoRunNext: true });
  await waitFor(() => expect(result.current.milestones[0]?.autoRunNext).toBe(true));
});

test("the autorun toggle moves before the round trip lands, then the server wins", async () => {
  // Anticipate — a patch held open, so the optimistic window is observable.
  const patch = deferred<Milestone>();
  patched.mockReturnValue(patch.promise);

  // Arrange
  const { result } = renderMilestones();
  await waitFor(() => expect(result.current.ready).toBe(true));

  // Act
  void result.current.setAutoRunNext(MILESTONE_ID, true);

  // Assert — optimistic: the checkbox must not sit dead for a round trip.
  await waitFor(() => expect(result.current.milestones[0]?.autoRunNext).toBe(true));

  patch.resolve({ ...READY, autoRunNext: true, name: "Renamed by the server" });
  await waitFor(() =>
    expect(result.current.milestones[0]?.name).toBe("Renamed by the server"),
  );
});

test("a rejected autorun toggle rolls back to the server's copy", async () => {
  // Anticipate
  patched.mockRejectedValue(new Error("Milestone not found: m1"));

  // Arrange
  const { result } = renderMilestones();
  await waitFor(() => expect(result.current.ready).toBe(true));

  // Act
  await result.current.setAutoRunNext(MILESTONE_ID, true);

  // Assert
  await waitFor(() => expect(result.current.error).toBe("Milestone not found: m1"));
  expect(result.current.milestones[0]?.autoRunNext).toBe(false);
});

test("starting the next feature returns the run and reloads the milestone", async () => {
  // Anticipate — the reload after the start sees the feature already moved on.
  const inProgress = milestone([feature("f1", "in_progress")]);
  started.mockResolvedValue({ id: "run-a" } as never);
  listed.mockResolvedValueOnce([READY]).mockResolvedValueOnce([inProgress]);

  // Arrange
  const { result } = renderMilestones();
  await waitFor(() => expect(result.current.ready).toBe(true));

  // Act
  const run = await result.current.startNext(MILESTONE_ID, {});

  // Assert
  expect(run?.id).toBe("run-a");
  await waitFor(() =>
    expect(result.current.milestones[0]?.features[0]?.status).toBe("in_progress"),
  );
});

test("switching project drops the previous project's milestones before the new fetch lands", async () => {
  // Arrange
  const other = milestone([feature("f9", "ready")], { id: "m2", name: "Other project" });
  const { rerender, result } = renderForProject("home");
  await waitFor(() => expect(result.current.ready).toBe(true));
  expect(result.current.milestones).toEqual([READY]);

  // Anticipate — the new project's fetch is held open, so the gap is observable.
  const second = deferred<typeof other[]>();
  listed.mockReturnValue(second.promise);

  // Act
  rerender({ project: "other-project" });

  // Assert — stale milestones from the old project must not linger in the rail.
  await waitFor(() => expect(result.current.milestones).toEqual([]));
  expect(result.current.ready).toBe(false);

  second.resolve([other]);
  await waitFor(() => expect(result.current.milestones).toEqual([other]));
});

test("a refresh of the same project never blanks the rail it already filled", async () => {
  // Arrange
  const { rerender, result } = renderMilestones("r1:running");
  await waitFor(() => expect(result.current.ready).toBe(true));

  // Anticipate — a slow refetch, so the in-between state is observable.
  const slow = deferred<Milestone[]>();
  listed.mockReturnValue(slow.promise);

  // Act
  rerender({ key: "r1:completed" });

  // Assert
  expect(result.current.milestones).toEqual([READY]);
  expect(result.current.ready).toBe(true);
  slow.resolve([READY]);
});

test("a start still returns its run when the follow-up reload fails", async () => {
  // Anticipate — the start succeeds, the reload behind it does not.
  started.mockResolvedValue({ id: "run-a" } as never);

  // Arrange
  const { result } = renderMilestones();
  await waitFor(() => expect(result.current.ready).toBe(true));
  listed.mockRejectedValue(new Error("Could not reach the server"));

  // Act
  const run = await result.current.startNext(MILESTONE_ID, {});

  // Assert — the run exists on the server; a refresh failure must not hide it
  // from the caller, or the UI would never navigate to a run already going.
  expect(run?.id).toBe("run-a");
  await waitFor(() => expect(result.current.error).toBe("Could not reach the server"));
});

test("a rejected start surfaces the server's reason and returns nothing to navigate to", async () => {
  // Anticipate
  started.mockRejectedValue(new Error("Milestone already has a feature run in progress"));

  // Arrange
  const { result } = renderMilestones();
  await waitFor(() => expect(result.current.ready).toBe(true));

  // Act
  const run = await result.current.startNext(MILESTONE_ID, {});

  // Assert
  expect(run).toBeUndefined();
  await waitFor(() =>
    expect(result.current.error).toBe("Milestone already has a feature run in progress"),
  );
});

test("a rejected finalize surfaces the server's reason and leaves the list alone", async () => {
  // Anticipate
  finalized.mockRejectedValue(new Error("Milestone has 1 unfinished feature"));

  // Arrange
  const { result } = renderMilestones();
  await waitFor(() => expect(result.current.ready).toBe(true));

  // Act
  await result.current.finalize(MILESTONE_ID);

  // Assert
  await waitFor(() =>
    expect(result.current.error).toBe("Milestone has 1 unfinished feature"),
  );
  expect(result.current.milestones).toEqual([READY]);
});

test("a failed load still reports ready, so the rail is not stuck loading forever", async () => {
  // Anticipate
  listed.mockRejectedValue(new Error("Could not reach the server"));

  // Act
  const { result } = renderMilestones();

  // Assert
  await waitFor(() => expect(result.current.ready).toBe(true));
  expect(result.current.error).toBe("Could not reach the server");
});

function renderMilestones(refreshKey = "") {
  return renderHook(
    ({ key }: { key: string }) => useMilestones("home", true, key),
    { initialProps: { key: refreshKey } },
  );
}

function renderForProject(projectId: string) {
  return renderHook(
    ({ project }: { project: string }) => useMilestones(project, true, ""),
    { initialProps: { project: projectId } },
  );
}
