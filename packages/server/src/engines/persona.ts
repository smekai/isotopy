import type { EngineRunContext } from "./types.js";

const PERSONA_SEPARATOR = "\n\n---\n\n";

export function withPersonaPrompt(ctx: EngineRunContext): EngineRunContext {
  if (!ctx.appendSystemPrompt) {
    return ctx;
  }
  return {
    ...ctx,
    prompt: `${ctx.appendSystemPrompt}${PERSONA_SEPARATOR}${ctx.prompt}`,
  };
}
