# In Progress

## TASK-168: Onboarding asks for a project and offers no way to add one
**Priority:** P2 | **Tags:** ui, setup, milestone-i
**Updated:** 2026-10-03 18:52

Observed in `TASK-142`'s dogfood by registering a real project through the UI for the first time in
a clean `ISOTOPY_USER_HOME`. Small, and all in the first sixty seconds a newcomer spends here.

**The Project panel names the need and cannot satisfy it.** It says "Home has no project folder —
every run works in its own scratch folder. Add a project to work on real code", and contains no
control that adds one. The control lives in `ProjectSwitcher` in the top bar, which is labelled with
the *current project's name* — "Home" — next to a separate "Project" button that opens the panel
that just told you to add one. Two adjacent controls, and the one that reads like the answer is the
wrong one.

**The folder picker has no path field.** Reaching `C:\Development\smekai\dogfood-focus-timer-142`
from `C:\` took four clicks. Anyone arriving with a path in hand — which is everyone registering a
project they already have — wants to paste it. `TASK-141` recorded the adjacent finding that a
newcomer meets a goal composer over a scratch workspace and is never told that registering a project
comes first; this is the same wound one layer in.

Cross-platform: a path field must accept both `C:\...` and `/Users/...` shapes and validate through
the existing `/fs` boundary rather than by pattern-matching a separator, and the picker's roots
differ per OS (drive letters versus `/`). The existing picker already lists roots per platform, so
the field joins that rather than replacing it.

---
