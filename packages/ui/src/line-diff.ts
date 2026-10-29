export const DIFF_LINE_KINDS = ["same", "added", "removed"] as const;

export type DiffLineKind = (typeof DIFF_LINE_KINDS)[number];

export interface DiffLine {
  kind: DiffLineKind;
  text: string;
}

function linesOf(text: string): string[] {
  const body = text.replace(/\r\n?/g, "\n").replace(/\n$/, "");
  return body === "" ? [] : body.split("\n");
}

function commonSuffixLengths(before: string[], after: string[]): number[][] {
  const lengths = Array.from({ length: before.length + 1 }, () => new Array<number>(after.length + 1).fill(0));
  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      lengths[i]![j] =
        before[i] === after[j]
          ? lengths[i + 1]![j + 1]! + 1
          : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!);
    }
  }
  return lengths;
}

export function lineDiff(beforeText: string, afterText: string): DiffLine[] {
  const before = linesOf(beforeText);
  const after = linesOf(afterText);
  const lengths = commonSuffixLengths(before, after);
  const diff: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < before.length || j < after.length) {
    if (i < before.length && j < after.length && before[i] === after[j]) {
      diff.push({ kind: "same", text: before[i]! });
      i += 1;
      j += 1;
    } else if (i < before.length && (j === after.length || lengths[i + 1]![j]! >= lengths[i]![j + 1]!)) {
      diff.push({ kind: "removed", text: before[i]! });
      i += 1;
    } else {
      diff.push({ kind: "added", text: after[j]! });
      j += 1;
    }
  }
  return diff;
}
