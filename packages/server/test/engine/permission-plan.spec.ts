import { expect, test } from "vitest";
import { permissionPlan } from "../../src/domain/rules/permission-plan.ts";

test("auto-review on a CLI that cannot do it runs unrestricted rather than failing the stage", () => {
  expect(permissionPlan("codex", "autoReview", "unsupported").strategy).toBe("unrestricted");
});

test("a CLI that could not be asked is treated the same as one that said no", () => {
  expect(permissionPlan("codex", "autoReview", "unknown").strategy).toBe("unrestricted");
});

test("a degradation always says so, and a granted auto-review never does", () => {
  expect(permissionPlan("cursor", "autoReview", "unsupported").notice).toBeDefined();
  expect(permissionPlan("claude-code", "autoReview", "available").notice).toBeUndefined();
});

test("what the probe answered cannot change a run that never asked for auto-review", () => {
  expect(permissionPlan("claude-code", "skip", "available")).toEqual({ strategy: "unrestricted" });
  expect(permissionPlan("claude-code", "acceptEdits", "available").strategy).toBe("acceptEdits");
});
