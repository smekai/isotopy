// Component test: the rail is fed by a snapshot *and* a live stream, and the
// hook opens the stream first so a status change landing in the gap is not lost.
// The same ordering hazard as useRunEvents, and equally invisible when it breaks
// — the rail simply shows a stale status until the next reload.
//
// Anticipate is the module-level `vi.mock("../../src/api")` plus `fakeRunListStream()`,
// which owns the deferred promises and the act() wrapping so no test body does.
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { HOME_PROJECT_ID } from "@isotopy/core";
import { useRunList } from "../../src/hooks/useRunList";
import { fakeRunListStream } from "../support/fake-run-list-stream";
import type { FakeRunListStream } from "../support/fake-run-list-stream";
import { run, stage, summary } from "../support/run-fixtures";

vi.mock("../../src/api", () => ({
  fetchRuns: vi.fn(),
  subscribeRunSummaries: vi.fn(),
}));

const OTHER_PROJECT = "proj-2";


let stream: FakeRunListStream;

beforeEach(() => {
  stream = fakeRunListStream();
});

afterEach(() => {
  vi.resetAllMocks();
});

test("nothing is fetched or subscribed until the project list is ready", () => {
  // Act
  const { result } = renderHook(() => useRunList(HOME_PROJECT_ID, false));

  // Assert
  expect(result.current.runs).toEqual([]);
  expect(result.current.ready).toBe(false);
  expect(stream.subscribeCount()).toBe(0);
});

test("the snapshot becomes the list", async () => {
  // Arrange
  const { result } = renderHook(() => useRunList(HOME_PROJECT_ID, true));

  // Act
  await stream.snapshot([run([stage("design", "running")])]);

  // Assert
  expect(result.current.runs.map((item) => item.id)).toEqual(["r1"]);
  expect(result.current.ready).toBe(true);
  expect(stream.subscribedProjectIds()).toEqual([HOME_PROJECT_ID]);
});

test("a summary arriving before the snapshot is replayed onto it", async () => {
  // Arrange
  const { result } = renderHook(() => useRunList(HOME_PROJECT_ID, true));

  // Act — the summary lands in the gap between subscribing and the snapshot.
  await stream.push(summary({ id: "r1", status: "completed" }));
  await stream.snapshot([run([stage("design", "running")], "running")]);

  // Assert
  expect(result.current.runs).toHaveLength(1);
  expect(result.current.runs[0]?.status).toBe("completed");
});

test("a summary arriving after the snapshot updates that run in place", async () => {
  // Arrange
  const { result } = renderHook(() => useRunList(HOME_PROJECT_ID, true));
  await stream.snapshot([run([stage("design", "running")], "running")]);

  // Act
  await stream.push(summary({ id: "r1", status: "awaiting" }));

  // Assert
  expect(result.current.runs).toHaveLength(1);
  expect(result.current.runs[0]?.status).toBe("awaiting");
});

test("a run the snapshot never held is prepended", async () => {
  // Arrange
  const { result } = renderHook(() => useRunList(HOME_PROJECT_ID, true));
  await stream.snapshot([run([stage("design", "passed")], "completed")]);

  // Act
  await stream.push(summary({ id: "fresh", status: "running" }));

  // Assert — the server sorts newest first, so an unseen run goes to the top.
  expect(result.current.runs.map((item) => item.id)).toEqual(["fresh", "r1"]);
});

test("a failed snapshot surfaces the error and still settles", async () => {
  // Arrange
  const { result } = renderHook(() => useRunList(HOME_PROJECT_ID, true));

  // Act
  await stream.failSnapshot("Project not found");

  // Assert — leaving `ready` false would hang the rail on a spinner forever.
  await waitFor(() => expect(result.current.error).toBe("Project not found"));
  expect(result.current.ready).toBe(true);
});

test("switching project resubscribes and drops the previous list", async () => {
  // Arrange
  const { result, rerender } = renderHook(
    (props: { projectId: string }) => useRunList(props.projectId, true),
    { initialProps: { projectId: HOME_PROJECT_ID } },
  );
  await stream.snapshot([run([stage("design", "running")])]);

  // Act
  rerender({ projectId: OTHER_PROJECT });

  // Assert
  expect(result.current.runs).toEqual([]);
  expect(result.current.ready).toBe(false);
  expect(stream.unsubscribeCount()).toBe(1);
  expect(stream.subscribedProjectIds()).toEqual([HOME_PROJECT_ID, OTHER_PROJECT]);
});

test("unmounting closes the stream", async () => {
  // Arrange
  const { unmount } = renderHook(() => useRunList(HOME_PROJECT_ID, true));
  await stream.snapshot([run([stage("design", "running")])]);

  // Act
  unmount();

  // Assert
  expect(stream.unsubscribeCount()).toBe(1);
});
