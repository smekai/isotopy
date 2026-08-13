// Component test: the preview is the second half of "see the thing that was
// built", and its one real risk is silence — a dev server that refuses framing
// rendering as a blank box. What is guarded here is that a refusal names the
// header that caused it and still offers a way through.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { ProductProcessStatus } from "@isotopy/core";
import { PreviewPanel } from "../../src/components/run/PreviewPanel";
import type { PreviewPanelProps } from "../../src/components/run/PreviewPanel";
import { DIRS } from "../../src/theme";

const d = DIRS.indigo;

const URL = "http://localhost:3000/";

afterEach(cleanup);

test("a running product that permits framing is embedded rather than linked", () => {
  // Act
  render(<PreviewPanel {...previewProps({ status: ready() })} />);

  // Assert
  expect(screen.getByTitle("The running product").getAttribute("src")).toBe(URL);
});

test("a product that refuses framing names the header that refused instead of showing a blank frame", () => {
  // Arrange
  const status = ready({ framing: { allowed: false, blockedBy: "X-Frame-Options: DENY" } });

  // Act
  render(<PreviewPanel {...previewProps({ status })} />);

  // Assert
  expect(screen.queryByTitle("The running product")).toBeNull();
  expect(screen.getByText("X-Frame-Options: DENY")).toBeDefined();
  expect(screen.getByTestId("product-open-external").getAttribute("href")).toBe(URL);
});

test("a readiness failure is shown with the reason the product gave, not just a failed state", () => {
  // Arrange
  const status = productStatus({
    state: "failed",
    lastError: "http://localhost:3000/ did not respond within 60s — EADDRINUSE",
  });

  // Act
  render(<PreviewPanel {...previewProps({ status })} />);

  // Assert
  expect(screen.getByText(/EADDRINUSE/)).toBeDefined();
  expect(screen.getByTestId("product-start")).toBeDefined();
});

test("a stopped product offers to start and nothing else, because nothing is running to stop", () => {
  // Act
  render(<PreviewPanel {...previewProps({ status: productStatus() })} />);

  // Assert
  expect(screen.getByTestId("product-start")).toBeDefined();
  expect(screen.queryByTestId("product-stop")).toBeNull();
  expect(screen.queryByTestId("product-restart")).toBeNull();
});

test("a running product offers to stop it, so nothing is left behind when the user is done looking", () => {
  // Arrange
  const stop = vi.fn().mockResolvedValue(undefined);

  // Act
  fireEvent.click(
    render(<PreviewPanel {...previewProps({ status: ready(), stop })} />).getByTestId(
      "product-stop",
    ),
  );

  // Assert
  expect(stop).toHaveBeenCalledOnce();
});

test("a product still starting says what it is waiting for rather than showing an empty frame", () => {
  // Act
  render(<PreviewPanel {...previewProps({ status: productStatus({ state: "starting", url: URL }) })} />);

  // Assert
  expect(screen.queryByTitle("The running product")).toBeNull();
  expect(screen.getByText(`Waiting for ${URL} to answer.`)).toBeDefined();
});

function productStatus(overrides: Partial<ProductProcessStatus> = {}): ProductProcessStatus {
  return {
    ...overrides,
    state: overrides.state ?? "stopped",
    configured: overrides.configured ?? true,
  };
}

function ready(overrides: Partial<ProductProcessStatus> = {}): ProductProcessStatus {
  return productStatus({ state: "ready", url: URL, framing: { allowed: true }, ...overrides });
}

function previewProps(overrides: Partial<PreviewPanelProps> = {}): PreviewPanelProps {
  return {
    d,
    status: overrides.status ?? null,
    error: overrides.error ?? null,
    busy: overrides.busy ?? false,
    start: overrides.start ?? vi.fn().mockResolvedValue(undefined),
    stop: overrides.stop ?? vi.fn().mockResolvedValue(undefined),
    restart: overrides.restart ?? vi.fn().mockResolvedValue(undefined),
  };
}
