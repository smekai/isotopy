export const MAX_LOG_MESSAGE_LENGTH = 1000;

export function truncate(text: string, max = MAX_LOG_MESSAGE_LENGTH): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export function withStderr(message: string, stderr: string): string {
  return stderr === "" || message.includes(stderr) ? message : `${message}\n${stderr}`;
}

export function firstLine(text: string): string | undefined {
  return text.split(/\r?\n/).find((line) => line.trim() !== "")?.trim();
}
