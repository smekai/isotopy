const FENCE = "---";

const BYTE_ORDER_MARK = /^\uFEFF/;

export type FrontMatterSplit =
  | { kind: "absent"; body: string }
  | { kind: "present"; block: string; body: string }
  | { kind: "unclosed" };

export function splitFrontMatter(text: string): FrontMatterSplit {
  const lines = text.replace(BYTE_ORDER_MARK, "").split(/\r?\n/);
  if (!isFence(lines[0])) {
    return { kind: "absent", body: lines.join("\n") };
  }
  const closing = lines.findIndex((line, index) => index > 0 && isFence(line));
  if (closing === -1) {
    return { kind: "unclosed" };
  }
  return {
    kind: "present",
    block: lines.slice(1, closing).join("\n"),
    body: lines.slice(closing + 1).join("\n"),
  };
}

export function withoutFrontMatter(text: string): string {
  const split = splitFrontMatter(text);
  return split.kind === "present" ? split.body : text;
}

function isFence(line: string | undefined): boolean {
  return line?.trimEnd() === FENCE;
}
