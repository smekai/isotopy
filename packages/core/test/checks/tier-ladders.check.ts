// The tier ladders are shipped data, edited by hand whenever a harness adds or retires a
// model. These hold the two properties no single ladder entry can enforce on its own.
import { expect, test } from "vitest";
import { ENGINE_IDS, MODEL_TIERS, bundledRosterFor, resolveTier } from "../../src/engines.ts";
import type { EngineId, ModelTier } from "../../src/engines.ts";

const PRICED_TIERS = MODEL_TIERS.filter((tier) => tier !== "auto");

test.each(ENGINE_IDS)(
  "%s resolves every priced preset to its own model and effort, so no preset is a second name for another",
  (engineId) => {
    const rungs = PRICED_TIERS.map((tier) => rung(engineId, tier));

    expect(repeatedIn(rungs)).toEqual([]);
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

function repeatedIn(rungs: string[]): string[] {
  return rungs.filter((value, index) => rungs.indexOf(value) !== index);
}
