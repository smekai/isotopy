// Component test: the product is the one piece of state with no SSE channel, so
// the hook's polling *is* the mechanism. The bug worth guarding is a product
// that dies after it went ready — without a poll past readiness the tab keeps
// showing a live iframe and a Stop button for a process that is gone.
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { ProductProcessStatus } from "@isotopy/core";
import { useProduct } from "../../src/hooks/useProduct";

const fetchProductStatus = vi.fn();
const startProduct = vi.fn();
const stopProduct = vi.fn();

vi.mock("../../src/api", () => ({
  fetchProductStatus: (...args: unknown[]) => fetchProductStatus(...args),
  startProduct: (...args: unknown[]) => startProduct(...args),
  stopProduct: (...args: unknown[]) => stopProduct(...args),
}));

const PROJECT = "proj-1";

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

test("a product that dies after going ready is noticed, not shown as running forever", async () => {
  // Arrange
  fetchProductStatus.mockResolvedValueOnce(productStatus({ state: "ready", url: "http://x/" }));
  const { result } = renderHook(() => useProduct(PROJECT));
  await waitFor(() => expect(result.current.status?.state).toBe("ready"));

  // Anticipate — the server has since recorded the process exiting on its own.
  fetchProductStatus.mockResolvedValue(
    productStatus({ state: "exited", lastError: "Stopped with exit code 1" }),
  );

  // Act
  await vi.advanceTimersByTimeAsync(6000);

  // Assert
  await waitFor(() => expect(result.current.status?.state).toBe("exited"));
});

test("a settled product is left alone rather than polled forever", async () => {
  // Arrange
  fetchProductStatus.mockResolvedValue(productStatus({ state: "stopped" }));
  const { result } = renderHook(() => useProduct(PROJECT));
  await waitFor(() => expect(result.current.status?.state).toBe("stopped"));

  // Act
  await vi.advanceTimersByTimeAsync(30_000);

  // Assert
  expect(fetchProductStatus).toHaveBeenCalledTimes(1);
});

test("a starting product is polled quickly, because the user is waiting on it", async () => {
  // Arrange
  fetchProductStatus.mockResolvedValueOnce(productStatus({ state: "starting" }));
  fetchProductStatus.mockResolvedValue(productStatus({ state: "ready", url: "http://x/" }));
  const { result } = renderHook(() => useProduct(PROJECT));
  await waitFor(() => expect(result.current.status?.state).toBe("starting"));

  // Act
  await vi.advanceTimersByTimeAsync(1200);

  // Assert
  await waitFor(() => expect(result.current.status?.state).toBe("ready"));
});

function productStatus(overrides: Partial<ProductProcessStatus> = {}): ProductProcessStatus {
  return {
    ...overrides,
    state: overrides.state ?? "stopped",
    configured: overrides.configured ?? true,
  };
}
