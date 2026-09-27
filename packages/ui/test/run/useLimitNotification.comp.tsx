// Component test: when a run parks on a plan limit while the tab is in the background,
// the browser notification is the only thing that reaches the user. It must never name
// a reset time it could not read.
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useLimitNotification } from "../../src/hooks/useLimitNotification";
import { limit } from "../support/run-fixtures";

const shown: NotificationOptions[] = [];

class FakeNotification {
  static permission: NotificationPermission = "granted";
  static requestPermission = async (): Promise<NotificationPermission> => "granted";

  constructor(_title: string, options: NotificationOptions) {
    shown.push(options);
  }
}

beforeEach(() => {
  shown.length = 0;
  vi.stubGlobal("Notification", FakeNotification);
  Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, "hidden");
  cleanup();
});

test("a reset time that cannot be read is left out of the notification, not shown as Invalid Date", () => {
  // Act
  renderHook(() => useLimitNotification(limit({ resetAt: "not-a-date" })));

  // Assert
  expect(shown.length).toBeGreaterThan(0);
  expect(shown.map((options) => options.body).join("\n")).not.toContain("Invalid Date");
});
