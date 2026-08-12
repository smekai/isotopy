# In Progress

## TASK-137: One dialog, an honest label, and a choice at the start
**Priority:** P1 | **Tags:** ui, core, server, milestone-f
**Updated:** 2026-08-12 14:20

**Widened on 2026-08-12 with the user**, who asked for all three at once because they land
on the same screens and are all cleanup. The original task was the first part only, and its
"not in scope: anything about what the Orchestrator decides" note is superseded by parts
two and three.

Three complaints, one root: the product decides things silently and then shows them in the
wrong place.

### 1. One dialog with the Orchestrator, not two tabs

An orchestration run opens on `Orchestrator` and puts `Chat` next to it, and the user has
to keep both in their head: the team proposal, the latest decision and the child runs live
on one tab, and the conversation those decisions are about lives on the other. The seam is
already visible in the product's own copy — `LatestDecision` tells the user to *"Answer in
the Chat tab to continue."* A panel that has to point at another tab to be usable is one
panel too many. The Orchestrator is who you talk to for most of an initiative; talking to
it should be one thread.

**The ask (from a user, which is what `TASK-134` said to wait for):** an orchestration run
has a single dialog. No `Orchestrator` tab.

Everything on `OrchestratorPanel` is either a message, a control that belongs to a message,
or run chrome. The team proposal becomes an inline card in the thread where it was
proposed, carrying **Approve & start**; child runs appear at the point the Orchestrator
started them, linked; goal, status pill, stop reason and decision error move to run chrome
beside `RunStatusBar`.

**Keep the interleaving honest.** The thread is `buildTranscript(run)` over one run, and
orchestration state arrives from a different load (`useOrchestration`) that can land before
or after it — `RunTabs.comp.tsx` already pins that ordering hazard. The merged view needs a
defined order for orchestration turns against transcript turns, and must not jump or
duplicate when the second source arrives late.

**What falls out.** `RunTab` loses `"team"`; `tabsFor` loses its orchestration branch and
the effect that force-opens it; an orchestration run then has the same three tabs as any
other. `run-tab-team` disappears from the testid list.

### 2. Engine and model tier asked at the start

The user's report was that the Orchestrator changes harnesses. It does not — `orchestrate.md`
grants it `modelTier` per role and nothing else, and there is no `engine` field in
`orchestratorRoleSchema` or `stageDefinitionSchema`. The real gap is that **neither** is
ever put to the user: `HomeComposer` prints `Engine: … — change in Setup` and posts
whatever Setup holds. The wire already accepts both, so this is a missing control, not a
missing capability.

Add engine and model-tier controls to the start composer, seeded from Setup. Default new
installs to the cheap end, per engine — `auto` for Cursor because its own routing is the
cheap path, `fast` elsewhere — and pin the `orchestrate` stage to `deep` so an economical
run default does not put the Orchestrator itself on the weakest model.

The Orchestrator keeps proposing per-role tiers as a refinement over the user's choice;
`TASK-115` stays as shipped.

### 3. A stage says who is acting and what they are doing

`StageNode` renders "who" from `agentForStage(stage.id)` — a table keyed by **stage id** —
and "what" from `stage.label`, which in every shipped pipeline is *also* a job title. They
agree redundantly in static pipelines ("Software Architect / Software Architect") and
disagree whenever the Orchestrator invents a stage id: it is given catalogs for `skill` and
`stepTask` but **no list of legal ids**, so `{id:"design", label:"Product Designer",
skill:"product-designer"}` renders as *Software Architect / Product Designer*.

Key the persona off `skill`, which `team-composition.ts` already validates against
`PERSONA_IDS`, and make every `label` an action — Scoping, Architecting, Implementing,
Verifying, Deploying the preview, Closing out. Teach the Orchestrator that `label` is an
action phrase, and guard it in `orchestrate-assignment.spec.ts` alongside `TASK-139`'s
existing enum guards.

### Boundaries

**Not in scope:** the `Plan` tab, the composer's send path, and `TASK-139`'s decision-loop
fixes. Note the overlap with `TASK-139`: it plans to feed `orchestration.decisionError`
back into the model on the observation that nothing reads it but `OrchestratorPanel`, which
this task deletes — decisionError's UI home moves to `RunStatusBar`, and whichever lands
second must not drop the other's reader.

Cross-platform: n/a — UI, pure core logic and prompt text; no paths, processes or shelling
out.

---
