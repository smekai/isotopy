export type LineEnding = "\r\n" | "\n";

export function lineEndingOf(text: string): LineEnding {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

export function withLineEnding(text: string, lineEnding: LineEnding): string {
  return text.replace(/\r\n|\n/g, lineEnding);
}
