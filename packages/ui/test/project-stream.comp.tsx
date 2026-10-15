// Component test: the run list and the initiatives both listen to the project
// stream. A browser allows six connections to one origin, and every open tab
// already holds this one plus a run's own, so api.ts gives both listeners one
// connection per project and closes it only when the last of them leaves.
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ORCHESTRATION_UPDATED_EVENT } from "@isotopy/core";
import { subscribeOrchestrations, subscribeRunSummaries } from "../src/api";
import { installFakeEventSources } from "./support/fake-event-source";
import type { FakeEventSource } from "./support/fake-event-source";
import { orchestration } from "./support/orchestration-fixtures";

const PROJECT = "proj-1";
const OTHER_PROJECT = "proj-2";

let opened: FakeEventSource[];
let stillListening: (() => void)[];

beforeEach(() => {
  opened = installFakeEventSources();
  stillListening = [];
});

afterEach(() => {
  stillListening.forEach((leave) => leave());
  vi.unstubAllGlobals();
});

test("the run list and the initiatives share one connection to a project's stream", () => {
  // Arrange
  stillListening.push(subscribeRunSummaries(PROJECT, vi.fn()));

  // Act
  stillListening.push(subscribeOrchestrations(PROJECT, vi.fn()));

  // Assert
  expect(opened).toHaveLength(1);
});

test("each project's stream is a connection of its own", () => {
  // Arrange
  stillListening.push(subscribeRunSummaries(PROJECT, vi.fn()));

  // Act
  stillListening.push(subscribeOrchestrations(OTHER_PROJECT, vi.fn()));

  // Assert
  expect(opened.map((source) => source.url)).toEqual([
    `/runs/events?project=${PROJECT}`,
    `/runs/events?project=${OTHER_PROJECT}`,
  ]);
});

test("an initiative's update reaches the initiatives, not the run list", () => {
  // Arrange
  const onSummary = vi.fn();
  const onOrchestration = vi.fn();
  stillListening.push(subscribeRunSummaries(PROJECT, onSummary));
  stillListening.push(subscribeOrchestrations(PROJECT, onOrchestration));

  // Act
  opened[0]?.deliver(ORCHESTRATION_UPDATED_EVENT, JSON.stringify(orchestration({ status: "stopped" })));

  // Assert
  expect(onOrchestration).toHaveBeenCalledWith(orchestration({ status: "stopped" }));
  expect(onSummary).not.toHaveBeenCalled();
});

test("the connection stays open while anyone still listens", () => {
  // Arrange
  const leave = subscribeRunSummaries(PROJECT, vi.fn());
  stillListening.push(subscribeOrchestrations(PROJECT, vi.fn()));

  // Act
  leave();

  // Assert
  expect(opened[0]?.closed).toBe(false);
});

test("the connection closes when the last listener leaves", () => {
  // Arrange
  const leave = subscribeOrchestrations(PROJECT, vi.fn());

  // Act
  leave();

  // Assert
  expect(opened[0]?.closed).toBe(true);
});

test("a project listened to again after everyone left gets a fresh connection", () => {
  // Arrange
  subscribeOrchestrations(PROJECT, vi.fn())();

  // Act
  stillListening.push(subscribeOrchestrations(PROJECT, vi.fn()));

  // Assert
  expect(opened.map((source) => source.closed)).toEqual([true, false]);
});
