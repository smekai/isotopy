export function structuralText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function markdownBody(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}

export function markdownBlocks(
  blocks: Array<string | undefined>,
  terminalNewline = false,
): string {
  const content = blocks
    .map((block) => (block === undefined ? "" : markdownBody(block)))
    .filter(Boolean)
    .join("\n\n");
  return terminalNewline && content ? `${content}\n` : content;
}

export function bullet(value: string): string {
  const lines = markdownBody(value).split("\n");
  return lines
    .map((line, index) => `${index === 0 ? "- " : "  "}${line}`)
    .join("\n");
}
