import type { CSSProperties, ReactNode } from "react";
import { MONO, RADIUS, SPACE } from "./theme";

const INLINE_TOKEN =
  /\*\*(.+?)\*\*|~~(.+?)~~|`([^`\n]+?)`|\*([^*\n]+?)\*|(?<!\w)_([^_\n]+?)_(?!\w)/g;

const codeStyle: CSSProperties = {
  fontFamily: MONO,
  fontSize: "0.9em",
  background: "rgba(127,127,127,0.16)",
  borderRadius: RADIUS.sm,
  padding: `${SPACE.xxs}px ${SPACE.xs}px`,
};

export function renderInlineMarkdown(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(INLINE_TOKEN)) {
    if (match.index > last) {
      nodes.push(text.slice(last, match.index));
    }
    const [bold, strike, code, starEm, underscoreEm] = match.slice(1);
    if (bold !== undefined) {
      nodes.push(<strong key={key++}>{renderInlineMarkdown(bold)}</strong>);
    } else if (strike !== undefined) {
      nodes.push(<s key={key++}>{renderInlineMarkdown(strike)}</s>);
    } else if (code !== undefined) {
      nodes.push(<code key={key++} style={codeStyle}>{code}</code>);
    } else {
      nodes.push(<em key={key++}>{(starEm ?? underscoreEm) as string}</em>);
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    nodes.push(text.slice(last));
  }
  return nodes;
}
