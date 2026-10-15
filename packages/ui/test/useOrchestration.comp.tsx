// Component test: an initiative's state can change after the last event of every
// run it owns — a stop applied once its run completed — so the hook takes each
// change from the project stream rather than guessing from the runs when to ask.
//
// Anticipate is the module-level `vi.mock("../src/api")` plus `fakeProjectStream()`,
// which owns the deferred promises and the act() wrapping so no test body does.
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { HOME_PROJECT_ID } from "@isotopy/core";
import type { Orchestration } from "@isotopy/core";
import { fetchOrchestrations, subscribeOrchestrations } from "../src/api";
import { useOrchestration } from "../src/hooks/useOrchestration";
import { fakeProjectStream } from "./support/fake-project-stream";
import type { FakeProjectStream } from "./support/fake-project-stream";
import { orchestration } from "./support/orchestration-fixtures";

vi.mock("../src/api", () => ({
  approveOrchestratorTeam: vi.fn(),
  fetchOrchestrations: vi.fn(),
  startOrchestration: vi.fn(),
  stopOrchestration: vi.fn(),
  subscribeOrchestrations: vi.fn(),
}));

let stream: FakeProjectStream<Orchestration, Orchestration>;

beforeEach(() => {
  stream = fakeProjectStream(fetchOrchestrations, subscribeOrchestrations);
});

afterEach(() => {
  vi.resetAllMocks();
});

test("an initiative's change on the project stream replaces the one loaded", async () => {
  // Arrange
  const { result } = renderHook(() => useOrchestration(HOME_PROJECT_ID, true));
  await stream.snapshot([orchestration({ status: "running" })]);

  // Act
  await stream.push(orchestration({ status: "stopped", stopReason: "goal met" }));

  // Assert
  expect(result.current.orchestrations).toEqual([
    orchestration({ status: "stopped", stopReason: "goal met" }),
  ]);
  expect(stream.subscribedProjectIds()).toEqual([HOME_PROJECT_ID]);
});
