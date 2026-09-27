// The tier ladders are shipped data, edited by hand whenever a harness adds or retires a
// model. These hold the two properties no single ladder entry can enforce on its own.
import { expect, test } from "vitest";
import { ENGINE_IDS, MODEL_TIERS, bundledRosterFor, resolveTier } from "../../src/engines.ts";
import type { EngineId, ModelTier } from "../../src/engines.ts";

test.each(ENGINE_IDS)(
  "%s separates Economy from Fast, so the cheapest preset is a real choice and not a second name for Fast",
  (engineId) => {
    expect(rung(engineId, "economy")).not.toBe(rung(engineId, "fast"));
  },
);

test.each(ENGINE_IDS)(
  "%s resolves every preset from the bundled roster alone, so a harness that cannot list models never degrades",
  (engineId) => {
    const degraded = MODEL_TIERS.filter(
      (tier) => resolveTier(engineId, tier, bundledRosterFor(engineId)).degraded,
    );

    expect(degraded).toEqual([]);
  },
);

function rung(engineId: EngineId, tier: ModelTier): string {
  const { model, effort } = resolveTier(engineId, tier, bundledRosterFor(engineId));
  return `${model} ${effort ?? ""}`;
}
