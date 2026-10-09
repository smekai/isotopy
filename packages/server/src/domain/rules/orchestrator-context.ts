export const ORCHESTRATOR_CONTEXT_LIMITS = { bytes: 4096, lines: 60 } as const;

export type OrchestratorContextRevision =
  | { ok: true; text: string }
  | { ok: false; reason: string };

export function normalizeOrchestratorContext(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/^(?:[ \t]*\n)+/, "").trimEnd();
}

export function reviseOrchestratorContext(revision: string): OrchestratorContextRevision {
  const text = normalizeOrchestratorContext(revision);
  const lines = text === "" ? 0 : text.split("\n").length;
  const bytes = new TextEncoder().encode(text).length;
  if (lines > ORCHESTRATOR_CONTEXT_LIMITS.lines) {
    return {
      ok: false,
      reason: `${lines} lines is over the ${ORCHESTRATOR_CONTEXT_LIMITS.lines}-line cap`,
    };
  }
  if (bytes > ORCHESTRATOR_CONTEXT_LIMITS.bytes) {
    return {
      ok: false,
      reason: `${bytes} bytes is over the ${ORCHESTRATOR_CONTEXT_LIMITS.bytes}-byte cap`,
    };
  }
  return { ok: true, text };
}
