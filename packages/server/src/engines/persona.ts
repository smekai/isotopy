// Persona fallback for harnesses with no system-prompt channel.
//
// Claude Code takes the stage persona natively via --append-system-prompt, so
// it stays in the system role. Cursor and Codex expose no equivalent flag, so
// they fold it into the head of the user prompt instead — same content reaches
// the model, keeping personas engine-agnostic.
import type { EngineRunContext } from "./types.js";

/** Separates the persona from the task so the model reads them as two blocks. */
const PERSONA_SEPARATOR = "\n\n---\n\n";

/**
 * Return a context whose `prompt` carries the persona. A no-op when the stage
 * has no persona, so single-box runs are unaffected.
 */
export function withPersonaPrompt(ctx: EngineRunContext): EngineRunContext {
  if (!ctx.appendSystemPrompt) {
    return ctx;
  }
  return {
    ...ctx,
    prompt: `${ctx.appendSystemPrompt}${PERSONA_SEPARATOR}${ctx.prompt}`,
  };
}
