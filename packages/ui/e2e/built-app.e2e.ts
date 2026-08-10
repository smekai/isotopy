import { expect, test } from "@playwright/test";
import { collectConsoleErrors } from "./support/console-errors";

// Built tier — the only test that drives the *compiled* artifact rather than the
// dev stack. Skipped unless ADHD_E2E_BUILT=1, so `pnpm e2e` keeps testing what
// developers actually run and needs no build step.
//
// Everything else in this suite boots `pnpm dev`: Vite serves the UI and proxies
// the API. That arrangement can never see the server's own static serving, which
// is deliberately inert outside a compiled build — so nothing here proved that
// `pnpm build && pnpm start` produces something a person can open. It used to
// produce an API and an unserved bundle, and no test noticed.
//
// The cheaper layer (packages/server/test/built-ui.comp.ts) asserts the server
// answers with the bundle. What no cheaper layer can tell us is whether a real
// browser *executes* it: correct MIME types, hashed asset paths resolving, the
// SPA mounting, and same-origin API calls succeeding with no Vite proxy in front.
//
//   ADHD_E2E_BUILT=1 pnpm --filter @adhd/ui e2e built-app

const BUILT = process.env.ADHD_E2E_BUILT === "1";

test.describe("the compiled app", () => {
  test.skip(!BUILT, "built tier — set ADHD_E2E_BUILT=1 to run (rebuilds first)");

  test("boots from the server's own bundle, with no Vite in front of it", async ({ page }) => {
    // Arrange
    const failures = collectConsoleErrors(page);

    // Act
    await page.goto("/");

    // Assert — the rail renders only once React has mounted and read the API.
    await expect(page.getByRole("button", { name: "Setup" })).toBeVisible();
    expect(failures).toEqual([]);
  });

  test("serves the API on the same origin, so the built UI needs no proxy", async ({ page }) => {
    // Act
    const response = await page.request.get("/health");

    // Assert
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true });
  });

  test("a first-time visitor can reach Setup, so the bundle is not a dead shell", async ({
    page,
  }) => {
    // Arrange
    await page.goto("/");

    // Act
    await page.getByRole("button", { name: "Setup" }).click();

    // Assert
    await expect(page.getByRole("button", { name: "AI Harness" })).toBeVisible();
  });
});
