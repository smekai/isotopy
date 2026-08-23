import { expect, test } from "vitest";
import { permissionPlan } from "../../src/domain/rules/permission-plan.ts";

const POSIX = true;
const WINDOWS = false;

test("auto-review on a CLI that cannot do it runs unrestricted rather than failing the stage", () => {
  expect(permissionPlan("codex", "autoReview", "unsupported", POSIX).strategy).toBe("unrestricted");
});

test("a CLI that could not be asked is treated the same as one that said no", () => {
  expect(permissionPlan("codex", "autoReview", "unknown", POSIX).strategy).toBe("unrestricted");
});

test("a degradation always says so, and a granted auto-review never does", () => {
  expect(permissionPlan("cursor", "autoReview", "unsupported", POSIX).notice).toBeDefined();
  expect(permissionPlan("claude-code", "autoReview", "available", POSIX).notice).toBeUndefined();
});

test("what the probe answered cannot change a run that never asked for auto-review", () => {
  expect(permissionPlan("claude-code", "skip", "available", POSIX)).toEqual({
    strategy: "unrestricted",
  });
  expect(permissionPlan("claude-code", "acceptEdits", "available", POSIX).strategy).toBe(
    "acceptEdits",
  );
});

test("Cursor's accept-edits sandbox is taken on POSIX, where the CLI actually has it", () => {
  expect(permissionPlan("cursor", "acceptEdits", "unknown", POSIX).strategy).toBe("acceptEdits");
});

test("Cursor's accept-edits sandbox degrades on Windows rather than failing the stage outright", () => {
  // `--sandbox enabled` exits 1 on Windows: "Sandbox requires macOS or Linux."
  // Passing it there would have broken every acceptEdits run on this platform.
  const plan = permissionPlan("cursor", "acceptEdits", "unknown", WINDOWS);

  expect(plan.strategy).toBe("unrestricted");
  expect(plan.notice).toContain("macOS or Linux");
});

test("an engine whose accept-edits is not platform-bound is unaffected by the platform", () => {
  expect(permissionPlan("claude-code", "acceptEdits", "unknown", WINDOWS).strategy).toBe(
    "acceptEdits",
  );
  expect(permissionPlan("codex", "acceptEdits", "unknown", WINDOWS).strategy).toBe("acceptEdits");
});
