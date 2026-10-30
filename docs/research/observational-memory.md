# Observational memory

**Question.** Mastra's observational memory compresses a long conversation into a dated log of
observations kept by background agents. The owner sees a likeness to the Orchestrator and asks
whether something like it belongs in Isotopy.

## How Mastra does it

From Mastra's observational memory guide (October 2026):

- **Observer**: once message history passes `observation.messageTokens` (default 30,000), it
  writes observations: short notes grouped under a date, each with a time and a priority marker,
  e.g. `🔴 12:10 User is building a Next.js app with Supabase auth`. It can also track the current
  task.
- **Reflector**: once the log passes `reflection.observationTokens` (default 40,000), it rewrites
  the whole log shorter, so the log stays bounded.
- **Context window** = recent raw messages (~6k–30k tokens) + the observation log (~40k) +
  reflections. No vector store.
- **Buffering**: the Observer runs in the background every 20% of the threshold, so activation is
  instant; a synchronous fallback runs at 1.2×.
- **Model**: `auto`, a cheap model from the main provider (Gemini 2.5 Flash when its key is set).
  Every observation and reflection is an extra model call.
- **Scope**: per thread by default; resource scope (shared across a user's threads) is
  deprecated as "works much worse".
- **Storage**: a database adapter (Postgres, LibSQL, MySQL, MongoDB, …).
- **Claimed compression**: 5×–40×.

## What Isotopy has that looks like it

| Isotopy | Written by | Bounded by | Read by |
|---|---|---|---|
| `orchestrator.context.md` | The Orchestrator, rewritten whole at each review | 4 KB / 60 lines | The next Orchestrator episode |
| `<persona>.notes.md` | Any stage, through an `isotopy-persona-notes` block; merged, deduplicated | 40 notes, oldest evicted | That persona only |
| Handoffs `runs/<id>/<stage>/handoff.md` | Each stage | none | Downstream stages in the run, seeded fix runs |
| Knowledge `agents/<id>/knowledge/` | The owner | none | Listed in the prompt, read on demand |
| CLI session id | The CLI | the CLI's own compaction | The same stage only (questions, waits, resume) |

The Orchestrator's context is already a Reflector in miniature: one agent rewrites a bounded
summary. What is missing is the **Observer**: nobody watches what the agents actually did
(transcripts, logs, decisions) and keeps a dated record across runs; each role writes its own
notes about itself, and only when it chooses to.

## Options

**1. An observer stage on the subscription CLI.** After a run settles (or on a schedule), a
cheap-tier stage reads the run's transcript and handoffs and appends dated observations to a
markdown log; a reflector stage rewrites the log when it passes a size. Both are ordinary
stages, so they need no model API.
- For: fits "never call a model API"; the log is markdown in git, auditable and editable by the
  owner; can serve the whole team, not one conversation.
- Against: costs subscription turns after every run; latency is a run, not a background call.

**2. Extend the existing notes.** Give the Orchestrator's review an explicit observation format
(date, priority, run link) and let it also maintain a team-wide log, not only its own context.
- For: no new stage; the Orchestrator already reads every settled run.
- Against: loads more onto the Orchestrator's turn (already `maxTurns: 24`, deep tier).

**3. Per-agent observation instead of per-team.** Each agent instance keeps its own
observational log (closest to Mastra's thread scope), replacing or merging with persona notes.
- For: each agent remembers its own work across runs; pairs with
  [parallel-agents.md](parallel-agents.md) instances.
- Against: N logs to bound; knowledge the team needs stays private to one agent.

**4. Use Mastra's implementation.** Not possible without its model-calling loop and a database
adapter; listed for completeness.

## Open questions

- What would read the log, and what question would it answer that today's context and notes
  do not? Find two or three cases in dogfood runs where an agent repeated a mistake or lost a
  fact across runs.
- Team-wide, per role, or per instance?
- Where does it live: git-tracked (shared, reviewable) or git-ignored like today's notes?
- How is it bounded in a markdown file the owner may also edit?
- Does it replace `orchestrator.context.md` and persona notes, or sit beside them? By "replace,
  don't accumulate", a new memory should retire an old one.

## What a decision needs

The cases it fixes, the scope, the trigger (per run, per schedule) and which existing memory it
replaces.

Source: [Mastra — Observational Memory](https://mastra.ai/docs/memory/observational-memory).
