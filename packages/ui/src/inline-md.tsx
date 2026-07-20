import type { CSSProperties, ReactNode } from "react";
import { MONO } from "./theme";

// One alternative per inline style, tried left-to-right at each position, so
// `**` outranks `*` and a `code` span consumes any markers inside it. The
// underscore form requires non-word neighbours so snake_case_names in paths
// and tool summaries don't turn italic (real markdown skips those too).
const INLINE_TOKEN =
  /\*\*(.+?)\*\*|~~(.+?)~~|`([^`\n]+?)`|\*([^*\n]+?)\*|(?<!\w)_([^_\n]+?)_(?!\w)/g;

const codeStyle: CSSProperties = {
  fontFamily: MONO,
  fontSize: "0.9em",
  background: "rgba(127,127,127,0.16)",
  borderRadius: 3,
  padding: "1px 4px",
};

/**
 * Render the basic inline markdown styles — `**bold**`, `*italic*`/`_italic_`,
 * `~~strikethrough~~`, `` `code` `` — as React nodes. Text goes through
 * React's normal escaping (no HTML injection is possible), and unmatched
 * markers pass through as literal characters. Bold/strikethrough content is
 * rendered recursively so `**bold with `code`**` still styles the inner span;
 * nesting can't loop because a lazy match never contains its own delimiter.
 */
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
