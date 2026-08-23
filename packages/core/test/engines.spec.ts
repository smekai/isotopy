import { describe, expect, test } from "vitest";
import {
  CAPABILITY_SUPPORTS,
  ENGINE_CAPABILITIES,
  ENGINE_IDS,
  MODEL_TIERS,
  bundledRosterFor,
  capabilityReachable,
  engineCapability,
  mergeModelLayers,
  resolveTier,
  rosterOrigins,
  tierLadderFor,
} from "../src/engines.ts";
import type {
  EngineModelOption,
  EngineModelRoster,
  ModelOptionDraft,
  ModelTier,
  StaticModelRoster,
  TierCandidate,
} from "../src/engines.ts";

function draft(id: string): ModelOptionDraft {
  return { id, label: id, hint: "" };
}

const BUNDLED = {
  checkedOn: "2026-08-07",
  options: [draft("bundled-primary"), draft("bundled-fallback")],
} satisfies StaticModelRoster;

const RESOLUTION_LADDER = tierLadderFor("claude-code", "deep");
const PREFERRED_CANDIDATE = RESOLUTION_LADDER[0] as TierCandidate;
const FALLBACK_CANDIDATE = RESOLUTION_LADDER[1] as TierCandidate;
const AUTO_CANDIDATE = tierLadderFor("claude-code", "auto")[0] as TierCandidate;

function originOf(roster: EngineModelRoster, id: string): string | undefined {
  return roster.options.find((option) => option.id === id)?.origin;
}

function rosterOf(...ids: string[]): EngineModelRoster {
  return {
    options: ids.map((id): EngineModelOption => ({ ...draft(id), origin: "live" })),
    staticCheckedOn: "2026-08-07",
  };
}

describe("mergeModelLayers", () => {
  test("Auto leads every roster, though no layer offers it", () => {
    const roster = mergeModelLayers({ live: [], bundled: BUNDLED });

    expect(roster.options[0]).toEqual({
      id: "",
      label: "Auto",
      hint: "use the CLI's own configured default",
      origin: "auto",
    });
  });

  test("an id only the bundled list knows is marked unverified", () => {
    const roster = mergeModelLayers({ live: [], bundled: BUNDLED });

    expect(originOf(roster, "bundled-primary")).toBe("static");
  });

  test("an id the CLI listed outranks the same id in the bundled list", () => {
    const roster = mergeModelLayers({ live: [draft("bundled-primary")], bundled: BUNDLED });

    expect(roster.options.filter((option) => option.id === "bundled-primary")).toEqual([
      { id: "bundled-primary", label: "bundled-primary", hint: "", origin: "live" },
    ]);
  });

  test("a configured id the bundled list also knows appears once, as verified", () => {
    const roster = mergeModelLayers({
      live: [],
      configured: draft("bundled-primary"),
      bundled: BUNDLED,
    });

    expect(roster.options.map((option) => option.id)).toEqual([
      "",
      "bundled-primary",
      "bundled-fallback",
    ]);
    expect(originOf(roster, "bundled-primary")).toBe("config");
  });
});

describe("rosterOrigins", () => {
  test("names each layer that contributed once, most authoritative first", () => {
    const roster = mergeModelLayers({
      live: [draft("a"), draft("b")],
      configured: draft("c"),
      bundled: BUNDLED,
    });

    expect(rosterOrigins(roster.options)).toEqual(["live", "config", "static"]);
  });

  test("Auto is not a layer — it is offered whether or not anything was resolved", () => {
    const roster = mergeModelLayers({ live: [], bundled: BUNDLED });

    expect(rosterOrigins(roster.options)).toEqual(["static"]);
  });
});

describe("resolveTier", () => {
  test("the first offered candidate wins regardless of roster order", () => {
    expect(resolveTier(
      "claude-code",
      "deep",
      rosterOf(FALLBACK_CANDIDATE.model, PREFERRED_CANDIDATE.model),
    )).toEqual({
      ...PREFERRED_CANDIDATE,
      degraded: false,
    });
  });

  test("an unavailable candidate falls through to the next offered candidate", () => {
    expect(resolveTier("claude-code", "deep", rosterOf(FALLBACK_CANDIDATE.model))).toEqual({
      ...FALLBACK_CANDIDATE,
      degraded: false,
    });
  });

  test("a ladder the harness offers nothing from degrades to its own default", () => {
    expect(resolveTier("claude-code", "deep", rosterOf("outside-the-ladder"))).toEqual({
      model: "",
      degraded: true,
    });
  });

  test("Auto asks for nothing, so it can never degrade", () => {
    expect(resolveTier("claude-code", "auto", rosterOf())).toEqual({
      ...AUTO_CANDIDATE,
      degraded: false,
    });
  });
});

describe("the capability catalog", () => {
  test.each(ENGINE_IDS)("%s answers every capability, so a new one cannot be forgotten", (engineId) => {
    const answered = ENGINE_CAPABILITIES.filter(
      (capability) => CAPABILITY_SUPPORTS.includes(engineCapability(engineId, capability)),
    );

    expect(answered).toEqual([...ENGINE_CAPABILITIES]);
  });

  test("a POSIX-only capability is reachable there and not on Windows", () => {
    // Cursor exits 1 on Windows: "Sandbox requires macOS or Linux."
    expect(engineCapability("cursor", "acceptEditsMode")).toBe("posixOnly");
    expect(capabilityReachable("posixOnly", true)).toBe(true);
    expect(capabilityReachable("posixOnly", false)).toBe(false);
  });

  test("a probed capability is not claimed until something has actually asked the CLI", () => {
    expect(capabilityReachable("probed", true)).toBe(false);
  });

  test("Cursor declares the cost it cannot report, rather than showing a confident zero", () => {
    expect(engineCapability("cursor", "costReporting")).toBe("unsupported");
    expect(engineCapability("claude-code", "costReporting")).toBe("supported");
  });
});

describe("the tier ladders as data", () => {
  test.each(ENGINE_IDS)(
    "%s separates Economy from Fast, so the cheapest preset is a real choice and not a second name for Fast",
    (engineId) => {
      const roster = bundledRosterFor(engineId);

      const rung = (tier: ModelTier) => {
        const { model, effort } = resolveTier(engineId, tier, roster);
        return model + " " + (effort ?? "");
      };

      expect(rung("economy")).not.toBe(rung("fast"));
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
});
