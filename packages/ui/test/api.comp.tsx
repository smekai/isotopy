// Component test: the server answers a rejected request with a generic `error` plus a
// per-field `issues` array, and only the issues say what to change. The network module
// is what turns that body into the message a dialog shows, so it is driven here
// through a stubbed fetch rather than mocked away.
import { afterEach, expect, test, vi } from "vitest";
import type { CreateScheduleInput } from "@isotopy/core";
import { createSchedule } from "../src/api";

const SCHEDULE: CreateScheduleInput = {
  name: "Nightly",
  cron: "0 9 * * *",
  timezone: "UTC",
  task: "Take the next task off the board",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

test("a rejection shows every field-level issue, not the generic error beside them", async () => {
  // Anticipate
  anticipateRejection({
    error: "Invalid request",
    issues: [{ message: "bad cron" }, { message: "bad zone" }],
  });

  // Act
  const created = createSchedule(SCHEDULE);

  // Assert
  await expect(created).rejects.toThrow("bad cron; bad zone");
});

test("a rejection that carries no issues shows the server's error", async () => {
  // Anticipate
  anticipateRejection({ error: "Unknown schedule" });

  // Act
  const created = createSchedule(SCHEDULE);

  // Assert
  await expect(created).rejects.toThrow("Unknown schedule");
});

test("an empty issues list is not a message, so the server's error still shows", async () => {
  // Anticipate
  anticipateRejection({ error: "Invalid request", issues: [] });

  // Act
  const created = createSchedule(SCHEDULE);

  // Assert
  await expect(created).rejects.toThrow("Invalid request");
});

function anticipateRejection(body: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status: 400 })),
  );
}
