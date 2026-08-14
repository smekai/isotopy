# Design reference

Visual reference for the Isotopy workspace UI. **Not product code** — nothing here is
built, imported, or linted. The shipping implementation lives in [`packages/ui`](../packages/ui).

| File | What it is |
| --- | --- |
| `App.tsx` | Prototype of the primary screens: pipeline canvas, focused stage (artifacts/log/reasoning/steer tabs), pipeline-level steering, setup, gate approve/reject, run history, empty state, and voice states (idle/listening/transcribing/speaking). Self-contained — imports only `react` and `lucide-react`. |
| `theme.css` | Design tokens (Indigo accent direction) as CSS custom properties. |
| `fonts.css` | Typography: Nunito (UI) + JetBrains Mono (code). |

These are a **snapshot**, kept for reference when adding screens. They are not kept in
sync with `packages/ui` — where the two disagree, `packages/ui` is authoritative.

The tokens are ported to [`packages/ui/src/theme.ts`](../packages/ui/src/theme.ts),
which carries all three accent directions (Indigo / Sakura / Forest).
