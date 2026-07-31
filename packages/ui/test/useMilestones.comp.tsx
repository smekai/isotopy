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
} from "../src/api";
import { useMilestones } from "../src/hooks/useMilestones";
import { deferred } from "./support/deferred";
import { feature, MILESTONE_ID, milestone } from "./support/milestone-fixtures";

vi.mock("../src/api", () => ({
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

function renderMilestones(refreshKey = "") {
  return renderHook(
    ({ key }: { key: string }) => useMilestones("home", true, key),
    { initialProps: { key: refreshKey } },
  );
}

test("loads the project's milestones and reports ready", async () => {
  const { result } = renderMilestones();

  await waitFor(() => expect(result.current.ready).toBe(true));
  expect(result.current.milestones).toEqual([READY]);
  expect(result.current.error).toBeNull();
});

test("stays inert until projects are ready, so no request races the project header", () => {
  renderHook(() => useMilestones("home", false, ""));

  expect(listed).not.toHaveBeenCalled();
});

test("refetches when a milestone run changes status, and not otherwise", async () => {
  const { rerender, result } = renderMilestones("r1:running");
  await waitFor(() => expect(result.current.ready).toBe(true));
  expect(listed).toHaveBeenCalledTimes(1);

  rerender({ key: "r1:running" });
  expect(listed).toHaveBeenCalledTimes(1);

  rerender({ key: "r1:completed" });
  await waitFor(() => expect(listed).toHaveBeenCalledTimes(2));
});

test("a toggled autorun replaces that milestone with the server's copy", async () => {
  const enabled: Milestone = { ...READY, autoRunNext: true };
  patched.mockResolvedValue(enabled);
  const { result } = renderMilestones();
  await waitFor(() => expect(result.current.ready).toBe(true));

  await result.current.setAutoRunNext(MILESTONE_ID, true);

  expect(patched).toHaveBeenCalledWith(MILESTONE_ID, { autoRunNext: true });
  await waitFor(() => expect(result.current.milestones[0]?.autoRunNext).toBe(true));
});

test("the autorun toggle moves before the round trip lands, then the server wins", async () => {
  const patch = deferred<Milestone>();
  patched.mockReturnValue(patch.promise);
  const { result } = renderMilestones();
  await waitFor(() => expect(result.current.ready).toBe(true));

  void result.current.setAutoRunNext(MILESTONE_ID, true);

  // Optimistic: the checkbox must not sit dead for a round trip.
  await waitFor(() => expect(result.current.milestones[0]?.autoRunNext).toBe(true));

  patch.resolve({ ...READY, autoRunNext: true, name: "Renamed by the server" });
  await waitFor(() =>
    expect(result.current.milestones[0]?.name).toBe("Renamed by the server"),
  );
});

test("a rejected autorun toggle rolls back to the server's copy", async () => {
  patched.mockRejectedValue(new Error("Milestone not found: m1"));
  const { result } = renderMilestones();
  await waitFor(() => expect(result.current.ready).toBe(true));

  await result.current.setAutoRunNext(MILESTONE_ID, true);

  await waitFor(() => expect(result.current.error).toBe("Milestone not found: m1"));
  expect(result.current.milestones[0]?.autoRunNext).toBe(false);
});

test("starting the next feature returns the run and reloads the milestone", async () => {
  const inProgress = milestone([feature("f1", "in_progress")]);
  started.mockResolvedValue({ id: "run-a" } as never);
  listed.mockResolvedValueOnce([READY]).mockResolvedValueOnce([inProgress]);
  const { result } = renderMilestones();
  await waitFor(() => expect(result.current.ready).toBe(true));

  const run = await result.current.startNext(MILESTONE_ID, {});

  expect(run?.id).toBe("run-a");
  await waitFor(() =>
    expect(result.current.milestones[0]?.features[0]?.status).toBe("in_progress"),
  );
});

test("a rejected start surfaces the server's reason and returns nothing to navigate to", async () => {
  started.mockRejectedValue(new Error("Milestone already has a feature run in progress"));
  const { result } = renderMilestones();
  await waitFor(() => expect(result.current.ready).toBe(true));

  const run = await result.current.startNext(MILESTONE_ID, {});

  expect(run).toBeUndefined();
  await waitFor(() =>
    expect(result.current.error).toBe("Milestone already has a feature run in progress"),
  );
});

test("a rejected finalize surfaces the server's reason and leaves the list alone", async () => {
  finalized.mockRejectedValue(new Error("Milestone has 1 unfinished feature"));
  const { result } = renderMilestones();
  await waitFor(() => expect(result.current.ready).toBe(true));

  await result.current.finalize(MILESTONE_ID);

  await waitFor(() =>
    expect(result.current.error).toBe("Milestone has 1 unfinished feature"),
  );
  expect(result.current.milestones).toEqual([READY]);
});

test("a failed load still reports ready, so the rail is not stuck loading forever", async () => {
  listed.mockRejectedValue(new Error("Could not reach the server"));
  const { result } = renderMilestones();

  await waitFor(() => expect(result.current.ready).toBe(true));
  expect(result.current.error).toBe("Could not reach the server");
});
