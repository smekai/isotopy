const MAX_NOTES = 40;

const BULLET = /^-\s+(.*\S)\s*$/;

export function parsePersonaNotes(markdown: string | undefined): string[] {
  return (markdown ?? "")
    .split("\n")
    .map((line) => BULLET.exec(line)?.[1])
    .filter((note): note is string => note !== undefined);
}

export function mergePersonaNotes(existing: string[], incoming: string[]): string[] {
  const kept = existing.filter((note) => !incoming.includes(note));
  return [...kept, ...incoming].slice(-MAX_NOTES);
}

export function renderPersonaNotes(notes: string[]): string {
  return notes.map((note) => `- ${note}`).join("\n");
}
