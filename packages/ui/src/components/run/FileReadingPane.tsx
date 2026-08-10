import type { CSSProperties } from "react";
import type { WorkspaceFileContent } from "../../api";
import type { Dir } from "../../theme";
import { FONT, SANS } from "../../theme";
import { FAIL_RED, READING_PANE, filePreview, formatBytes } from "./run-styles";

function note(d: Dir): CSSProperties {
  return { color: d.textMuted, fontFamily: SANS, fontSize: FONT.md };
}

export interface FileReadingPaneProps {
  file: WorkspaceFileContent | null;
  error: string | null;
  placeholder: string;
  d: Dir;
}

export function FileReadingPane({ file, error, placeholder, d }: FileReadingPaneProps) {
  return (
    <div style={READING_PANE}>
      {error !== null ? (
        <div style={{ ...note(d), color: FAIL_RED }}>{error}</div>
      ) : file?.truncated ? (
        <div style={note(d)}>File is too large to preview ({formatBytes(file.size)}).</div>
      ) : file ? (
        <pre style={{ ...filePreview, color: d.text }}>{file.content}</pre>
      ) : (
        <div style={note(d)}>{placeholder}</div>
      )}
    </div>
  );
}
