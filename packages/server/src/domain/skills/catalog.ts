export interface CatalogEntry {
  id: string;
  summary: string;
}

export const PERSONA_CATALOG: CatalogEntry[] = [
  {
    id: "orchestrator",
    summary:
      "Orchestrator — you. Close a run out yourself; no specialist saw the whole run. Never compose yourself to plan, implement, review, or verify.",
  },
  {
    id: "project-manager",
    summary:
      "Product Manager — turns intent into reviewable feature scope.",
  },
  {
    id: "product-designer",
    summary:
      "Product Designer — translates approved product intent into implementable interaction guidance.",
  },
  {
    id: "software-architect",
    summary:
      "Software Architect — architectural design and independent technical review, proportional to the feature.",
  },
  {
    id: "architect",
    summary:
      "Architect — writes and refactors code to a strict standard; generated from the repository's own architecture document.",
  },
  {
    id: "developer",
    summary:
      "Developer — implements the approved feature in the repository, specializing to the work in front of it.",
  },
  {
    id: "tester",
    summary:
      "QA Engineer — independently verifies the implementation with automated and interactive checks.",
  },
  {
    id: "release-manager",
    summary:
      "Release Manager — turns quality-approved implementation into a traceable, release-ready handoff.",
  },
  {
    id: "sre",
    summary:
      "Site Reliability Engineer — safe, observable, reversible deployment execution.",
  },
  {
    id: "solo",
    summary:
      "Agent — the whole team in one box, for work too small to justify a team.",
  },
];
