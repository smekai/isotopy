import { expect, test } from "@playwright/test";
import { collectConsoleErrors } from "./support/console-errors";

// Built tier — the only test that drives the *compiled* artifact rather than the
// dev stack. Skipped unless ISOTOPY_E2E_BUILT=1, so `pnpm e2e` keeps testing what
// developers actually run and needs no build step.
//
// `pnpm build` used to emit a server and a UI bundle that nothing served, so
// there was no way to run the built app at all — the gap a first-time installer
// hits first, and one no other tier could see, because every other tier boots
// the dev server.
//
// No cheaper layer can replace this. A component test could assert that a
// bundle is answered with, but not the part that actually breaks: that a real
// browser *executes* it — MIME types, hashed asset paths resolving, the SPA
// mounting, and the proxied API answering the built page.
//
//   ISOTOPY_E2E_BUILT=1 pnpm --filter @isotopy/ui e2e built-app

const BUILT = process.env.ISOTOPY_E2E_BUILT === "1";

test.describe("the compiled app", () => {
  test.skip(!BUILT, "built tier — set ISOTOPY_E2E_BUILT=1 to run (rebuilds first)");

  test("boots from the built bundle, not from a dev server compiling on the fly", async ({
    page,
  }) => {
    // Arrange
    const failures = collectConsoleErrors(page);

    // Act
    await page.goto("/");

    // Assert — the rail renders only once React has mounted and read the API.
    await expect(page.getByRole("button", { name: "Setup" })).toBeVisible();
    expect(failures).toEqual([]);
  });

  test("reaches the API through the preview proxy, exactly as the dev server does", async ({
    page,
  }) => {
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
