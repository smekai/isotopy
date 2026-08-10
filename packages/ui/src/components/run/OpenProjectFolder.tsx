import { useState } from "react";
import type { CSSProperties } from "react";
import { FolderOpen } from "lucide-react";
import { revealRunFolder } from "../../api";
import type { Dir } from "../../theme";
import { FONT, ICON, RADIUS, SANS, SPACE, WEIGHT } from "../../theme";
import { FAIL_RED } from "./run-styles";

const ROW: CSSProperties = { display: "flex", alignItems: "center", gap: SPACE.md };

function revealButton(d: Dir, disabled: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: SPACE.sm,
    border: `1px solid ${d.border}`,
    borderRadius: RADIUS.md,
    padding: `${SPACE.xs}px ${SPACE.xl}px`,
    background: "transparent",
    color: disabled ? d.textMuted : d.accent,
    cursor: disabled ? "default" : "pointer",
    fontFamily: SANS,
    fontSize: FONT.sm,
    fontWeight: WEIGHT.medium,
    whiteSpace: "nowrap",
  };
}

function errorText(): CSSProperties {
  return { color: FAIL_RED, fontFamily: SANS, fontSize: FONT.xs };
}

export interface OpenProjectFolderProps {
  runId: string;
  d: Dir;
}

export function OpenProjectFolder({ runId, d }: OpenProjectFolderProps) {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function open() {
    setOpening(true);
    revealRunFolder(runId)
      .then(() => setError(null))
      .catch((failure: unknown) =>
        setError(failure instanceof Error ? failure.message : "Could not open the folder"),
      )
      .finally(() => setOpening(false));
  }

  return (
    <div style={ROW}>
      <button
        type="button"
        onClick={open}
        disabled={opening}
        data-testid="open-project-folder"
        style={revealButton(d, opening)}
      >
        <FolderOpen size={ICON.sm} />
        Open project folder
      </button>
      {error !== null && <span style={errorText()}>{error}</span>}
    </div>
  );
}
