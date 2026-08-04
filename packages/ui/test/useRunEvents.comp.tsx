// Component test: the hook opens the SSE stream *before* fetching the snapshot
// and replays what arrived in the gap, so nothing is lost between the two calls.
// That ordering is invisible in the UI when it breaks — events simply go missing
// on fast runs — and it is why this file exists rather than an e2e case.
// A .tsx component test rather than a .comp.ts one because rendering needs jsdom.
//
// Anticipate is the module-level `vi.mock("../src/api")` plus `fakeRunStream()`:
// api.ts is the UI's one network boundary, and the fake owns every deferred
// promise and act() wrapping so no test body has to.
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useRunEvents } from "../src/hooks/useRunEvents";
import { fakeRunStream } from "./support/fake-run-stream";
import type { FakeRunStream } from "./support/fake-run-stream";
import { RUN_ID, event, run, stage, stageOf } from "./support/run-fixtures";

vi.mock("../src/api", () => ({
  fetchRun: vi.fn(),
  subscribeRunEvents: vi.fn(),
}));

let stream: FakeRunStream;

beforeEach(() => {
  stream = fakeRunStream();
});

afterEach(() => {
  vi.resetAllMocks();
});

test("a null run id subscribes to nothing and exposes no run", () => {
  // Act
  const { result } = renderHook(() => useRunEvents(null));

  // Assert
  expect(result.current.run).toBeNull();
  expect(stream.subscribeCount()).toBe(0);
});

test("the snapshot becomes the run", async () => {
  // Arrange
  const { result } = renderHook(() => useRunEvents(RUN_ID));

  // Act
  await stream.snapshot(run([stage("design", "running")]));

  // Assert
  expect(result.current.run?.id).toBe(RUN_ID);
  expect(stream.subscribedRunIds()).toEqual([RUN_ID]);
});

test("an event arriving before the snapshot is replayed onto it", async () => {
  // Arrange
  const { result } = renderHook(() => useRunEvents(RUN_ID));

  // Act — the event lands in the gap between subscribing and the snapshot.
  await stream.emit(event("stage.completed", { stageId: "design", status: "passed", message: "Stage passed" }));
  await stream.snapshot(run([stage("design", "running")]));

  // Assert
  expect(stageOf(result.current.run, "design").status).toBe("passed");
});

test("an event arriving after the snapshot is applied to it", async () => {
  // Arrange
  const { result } = renderHook(() => useRunEvents(RUN_ID));
  await stream.snapshot(run([stage("design", "running")]));

  // Act
  await stream.emit(event("stage.awaiting", { stageId: "design", status: "awaiting", message: "Awaiting approval" }));

  // Assert
  expect(stageOf(result.current.run, "design").status).toBe("awaiting");
  expect(result.current.run?.status).toBe("awaiting");
});

test("a log the snapshot already contains is not duplicated by the replay", async () => {
  // Arrange — the same log in both the replayed event and the snapshot.
  const logged = event("stage.log", { stageId: "design", message: "building", level: "info" });
  const withLog = run([stage("design", "running")]);
  stageOf(withLog, "design").logs.push({
    ts: logged.ts,
    level: "info",
    message: "building",
  });
  const { result } = renderHook(() => useRunEvents(RUN_ID));

  // Act
  await stream.emit(logged);
  await stream.snapshot(withLog);

  // Assert
  expect(stageOf(result.current.run, "design").logs).toHaveLength(1);
});

test("run.completed closes the stream", async () => {
  // Arrange
  renderHook(() => useRunEvents(RUN_ID));
  await stream.snapshot(run([stage("design", "running")]));

  // Act
  await stream.emit(event("run.completed", { status: "completed", message: "Run finished" }));

  // Assert
  expect(stream.unsubscribeCount()).toBe(1);
});

test("a snapshot that is already terminal closes the stream immediately", async () => {
  // Arrange
  renderHook(() => useRunEvents(RUN_ID));

  // Act
  await stream.snapshot(run([stage("design", "passed")], "completed"));

  // Assert
  expect(stream.unsubscribeCount()).toBe(1);
});

test("a failed snapshot surfaces the error", async () => {
  // Arrange
  const { result } = renderHook(() => useRunEvents(RUN_ID));

  // Act
  await stream.failSnapshot("Run not found");

  // Assert
  await waitFor(() => expect(result.current.error).toBe("Run not found"));
});

test("bumping the resubscribe key opens a second subscription", async () => {
  // Arrange
  const { rerender } = renderHook(
    (props: { resubKey: number }) => useRunEvents(RUN_ID, props.resubKey),
    { initialProps: { resubKey: 0 } },
  );
  await stream.snapshot(run([stage("design", "running")]));

  // Act
  rerender({ resubKey: 1 });

  // Assert
  expect(stream.subscribeCount()).toBe(2);
  expect(stream.unsubscribeCount()).toBe(1);
});

test("unmounting closes the stream", async () => {
  // Arrange
  const { unmount } = renderHook(() => useRunEvents(RUN_ID));
  await stream.snapshot(run([stage("design", "running")]));

  // Act
  unmount();

  // Assert
  expect(stream.unsubscribeCount()).toBe(1);
});
