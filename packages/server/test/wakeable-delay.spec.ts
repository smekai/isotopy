// The durable worker's poll loop sleeps on this between ticks. Work that
// Isotopy enqueues wakes it, so a run starts at once instead of after the
// worker's idle backoff (up to a second, paid at every run start and signal).
import { expect, test } from "vitest";
import { WakeableDelay } from "../src/utils/wakeable-delay.ts";

const LONG_MS = 60_000;

test("a wake ends a wait at once and says it was woken", async () => {
  // Arrange
  const delay = new WakeableDelay();
  const waiting = delay.wait(LONG_MS);

  // Act
  delay.wake();

  // Assert
  expect(await waiting).toBe(true);
});

test("a wait that runs out says it was not woken", async () => {
  // Arrange
  const delay = new WakeableDelay();

  // Act
  const woken = await delay.wait(1);

  // Assert
  expect(woken).toBe(false);
});

test("a wake while nothing waits is kept for the next wait, so work enqueued mid-tick is not slept through", async () => {
  // Arrange
  const delay = new WakeableDelay();
  delay.wake();

  // Act
  const woken = await delay.wait(LONG_MS);

  // Assert
  expect(woken).toBe(true);
});

test("a kept wake is spent by one wait, not every wait after it", async () => {
  // Arrange
  const delay = new WakeableDelay();
  delay.wake();
  await delay.wait(LONG_MS);

  // Act
  const woken = await delay.wait(1);

  // Assert
  expect(woken).toBe(false);
});
