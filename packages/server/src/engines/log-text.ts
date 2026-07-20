// Text helpers shared by the engine adapters for shaping CLI output into
// run-log messages.

/** Cap on a single run-log message; longer text is ellipsized at this length. */
export const MAX_LOG_MESSAGE_LENGTH = 1000;

/** Flatten whitespace and cap length so one message stays one log line. */
export function truncate(text: string, max = MAX_LOG_MESSAGE_LENGTH): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** First non-blank line of a command's output, trimmed. */
export function firstLine(text: string): string | undefined {
  return text.split(/\r?\n/).find((line) => line.trim() !== "")?.trim();
}
