// Component test: schedules have no SSE channel, and a skipped window produces no
// run at all, so nothing else in the app can tell this hook that state moved. Its
// whole contract is when it refetches and what a failed mutation reports back —
// both invisible from outside, and both the difference between a dialog that
// keeps a rejected expression on screen and one that silently discards it.
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { SCHEDULE_TICK_MS } from "@isotopy/core";
import {
  createSchedule,
  deleteSchedule,
  fetchSchedules,
  updateSchedule,
} from "../../src/api";
import { useSchedules } from "../../src/hooks/useSchedules";
import { scheduleView } from "../support/orchestration-fixtures";

vi.mock("../../src/api", () => ({
  fetchSchedules: vi.fn(),
  createSchedule: vi.fn(),
  updateSchedule: vi.fn(),
  deleteSchedule: vi.fn(),
}));

const listed = vi.mocked(fetchSchedules);
const created = vi.mocked(createSchedule);
const patched = vi.mocked(updateSchedule);
const removed = vi.mocked(deleteSchedule);

const SCHEDULE = scheduleView({ id: "s1" });

beforeEach(() => {
  listed.mockResolvedValue([SCHEDULE]);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

test("loads the project's schedules and reports ready", async () => {
  // Act
  const { result } = renderSchedules();

  // Assert
  await waitFor(() => expect(result.current.ready).toBe(true));
  expect(result.current.schedules).toEqual([SCHEDULE]);
});

test("asks again on the ticker's cadence, because a fire nothing else can announce moves this state", async () => {
  // Arrange — a background fire advances nextFireAt and the last outcome with no
  // run event to ride on, and a skipped window emits no run at all.
  vi.useFakeTimers();
  const { result } = renderSchedules();
  await vi.waitFor(() => expect(result.current.ready).toBe(true));
  const fired = scheduleView({ id: "s1", lastOutcome: { kind: "fired", runId: "r1" } });
  listed.mockResolvedValue([fired]);

  // Act
  await act(async () => {
    await vi.advanceTimersByTimeAsync(SCHEDULE_TICK_MS);
  });

  // Assert
  expect(result.current.schedules[0]?.lastOutcome).toEqual({ kind: "fired", runId: "r1" });
});

test("a rejected expression is reported rather than swallowed, so the dialog can keep it on screen", async () => {
  // Arrange
  created.mockRejectedValue(new Error("cron: not a cron expression"));
  const { result } = renderSchedules();
  await waitFor(() => expect(result.current.ready).toBe(true));

  // Act
  const saved = await act(() => result.current.create(bodyOf(SCHEDULE)));

  // Assert — undefined is what stops App closing the modal over the error.
  expect(saved).toBeUndefined();
  expect(result.current.error).toContain("not a cron expression");
});

test("a failed edit reports failure rather than a silent void", async () => {
  // Arrange
  patched.mockRejectedValue(new Error("Mars/Olympus is not an IANA time zone"));
  const { result } = renderSchedules();
  await waitFor(() => expect(result.current.ready).toBe(true));

  // Act
  const ok = await act(() => result.current.update("s1", { timezone: "Mars/Olympus" }));

  // Assert
  expect(ok).toBe(false);
  expect(result.current.error).toContain("IANA time zone");
});

test("a failed delete reports failure, so the app does not navigate away from a schedule still there", async () => {
  // Arrange
  removed.mockRejectedValue(new Error("Unknown schedule"));
  const { result } = renderSchedules();
  await waitFor(() => expect(result.current.ready).toBe(true));

  // Act
  const ok = await act(() => result.current.remove("s1"));

  // Assert
  expect(ok).toBe(false);
  expect(result.current.schedules).toHaveLength(1);
});

test("a successful edit reports success and replaces the schedule in place", async () => {
  // Arrange
  const renamed = scheduleView({ id: "s1", name: "Nightly sweep" });
  patched.mockResolvedValue(renamed);
  const { result } = renderSchedules();
  await waitFor(() => expect(result.current.ready).toBe(true));

  // Act
  const ok = await act(() => result.current.update("s1", { name: "Nightly sweep" }));

  // Assert
  expect(ok).toBe(true);
  expect(result.current.schedules[0]?.name).toBe("Nightly sweep");
});

function renderSchedules() {
  return renderHook(() => useSchedules("home", true));
}

function bodyOf(schedule: typeof SCHEDULE) {
  return {
    name: schedule.name,
    cron: schedule.cron,
    timezone: schedule.timezone,
    task: schedule.task,
    team: schedule.team,
  };
}
