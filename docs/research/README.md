# Research

Open questions the owner raised on 2026-10-29, after comparing Isotopy with Mastra. Each file
states the question, what exists today, the options and what is still unknown. **None of them
records a decision**; a decision goes to [`decisions.md`](../decisions.md) once it is taken.

The code they describe is as of commit `1b91976` (TASK-208, one team per project).

| Order | File | Question |
|---|---|---|
| 1 | [modules.md](modules.md) | Which modules is Isotopy made of, and where do their boundaries go? |
| 2 | [agent-configuration.md](agent-configuration.md) | Tools, skills, permissions, schedules and memory per agent: copy Mastra, reuse it, or build our own? |
| 3 | [observational-memory.md](observational-memory.md) | Does Mastra's observational memory belong in Isotopy, and in what form? |
| 4 | [storage.md](storage.md) | A database, or our own store on markdown plus metadata, possibly as a separate project? |
| 5 | [parallel-agents.md](parallel-agents.md) | One agent instance holds one task; two developers means two instances. What does that take? |
| 6 | [ui-team-home.md](ui-team-home.md) | A redesign where Home watches the team at work, with room for manual settings and intervention. |

Modules come first: the other five land on that map.
