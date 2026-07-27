// Component test: the hook opens the SSE stream *before* fetching the snapshot
// and replays what arrived in the gap, so nothing is lost between the two calls.
// That ordering is invisible in the UI when it breaks — events simply go missing
// on fast runs — and it is why this file exists rather than an e2e case.
// A .tsx component test rather than a .comp.ts one because rendering needs jsdom.
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
  const { result } = renderHook(() => useRunEvents(null));

  expect(result.current.run).toBeNull();
  expect(stream.subscribeCount()).toBe(0);
});

test("the snapshot becomes the run", async () => {
  const { result } = renderHook(() => useRunEvents(RUN_ID));

  await stream.snapshot(run([stage("design", "running")]));

  expect(result.current.run?.id).toBe(RUN_ID);
  expect(stream.subscribedRunIds()).toEqual([RUN_ID]);
});

test("an event arriving before the snapshot is replayed onto it", async () => {
  const { result } = renderHook(() => useRunEvents(RUN_ID));

  await stream.emit(event("stage.completed", { stageId: "design" }));
  await stream.snapshot(run([stage("design", "running")]));

  expect(stageOf(result.current.run, "design").status).toBe("passed");
});

test("an event arriving after the snapshot is applied to it", async () => {
  const { result } = renderHook(() => useRunEvents(RUN_ID));

  await stream.snapshot(run([stage("design", "running")]));
  await stream.emit(event("stage.awaiting", { stageId: "design" }));

  expect(stageOf(result.current.run, "design").status).toBe("awaiting");
  expect(result.current.run?.status).toBe("awaiting");
});

test("a log the snapshot already contains is not duplicated by the replay", async () => {
  const logged = event("stage.log", { stageId: "design", message: "building" });
  const withLog = run([stage("design", "running")]);
  stageOf(withLog, "design").logs.push({
    ts: logged.ts,
    level: "info",
    message: "building",
  });

  const { result } = renderHook(() => useRunEvents(RUN_ID));

  await stream.emit(logged);
  await stream.snapshot(withLog);

  expect(stageOf(result.current.run, "design").logs).toHaveLength(1);
});

test("run.completed closes the stream", async () => {
  renderHook(() => useRunEvents(RUN_ID));

  await stream.snapshot(run([stage("design", "running")]));
  await stream.emit(event("run.completed", { status: "completed" }));

  expect(stream.unsubscribeCount()).toBe(1);
});

test("a snapshot that is already terminal closes the stream immediately", async () => {
  renderHook(() => useRunEvents(RUN_ID));

  await stream.snapshot(run([stage("design", "passed")], "completed"));

  expect(stream.unsubscribeCount()).toBe(1);
});

test("a failed snapshot surfaces the error", async () => {
  const { result } = renderHook(() => useRunEvents(RUN_ID));

  await stream.failSnapshot("Run not found");

  await waitFor(() => expect(result.current.error).toBe("Run not found"));
});

test("bumping the resubscribe key opens a second subscription", async () => {
  const { rerender } = renderHook(
    (props: { resubKey: number }) => useRunEvents(RUN_ID, props.resubKey),
    { initialProps: { resubKey: 0 } },
  );

  await stream.snapshot(run([stage("design", "running")]));
  rerender({ resubKey: 1 });

  expect(stream.subscribeCount()).toBe(2);
  expect(stream.unsubscribeCount()).toBe(1);
});

test("unmounting closes the stream", async () => {
  const { unmount } = renderHook(() => useRunEvents(RUN_ID));

  await stream.snapshot(run([stage("design", "running")]));
  unmount();

  expect(stream.unsubscribeCount()).toBe(1);
});
