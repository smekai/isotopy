import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { ArrowUp, Folder, HardDrive, X } from "lucide-react";
import { fetchDirectories } from "../api";
import type { DirectoryListing } from "../api";
import type { Dir } from "../theme";
import { FONT, ICON, MONO, RADIUS, SANS, SPACE, WEIGHT, Z } from "../theme";

const DIALOG_WIDTH = 560;
const LIST_MIN_HEIGHT = 140;
const SCRIM = "rgba(30,27,75,0.20)";
const ERROR_RED = "#DC2626";

const BACKDROP: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: Z.overlayNested,
  background: SCRIM,
  backdropFilter: "blur(4px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: SPACE.x5l,
};

function dialog(d: Dir): CSSProperties {
  return {
    width: DIALOG_WIDTH,
    maxHeight: "70vh",
    display: "flex",
    flexDirection: "column",
    background: d.surface,
    border: `1px solid ${d.border}`,
    borderRadius: RADIUS.xxl,
    boxShadow: d.elevation.lg,
    overflow: "hidden",
  };
}

function headerRow(d: Dir): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: SPACE.lg,
    padding: `${SPACE.xl}px ${SPACE.xxl}px`,
    borderBottom: `1px solid ${d.border}`,
  };
}

function headerTitle(d: Dir): CSSProperties {
  return { color: d.text, fontFamily: SANS, fontSize: FONT.xl, fontWeight: WEIGHT.bold };
}

function closeButton(d: Dir): CSSProperties {
  return { background: "none", border: "none", cursor: "pointer", color: d.textMuted, padding: SPACE.xs };
}

function breadcrumbRow(d: Dir): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: SPACE.md,
    padding: `${SPACE.md}px ${SPACE.xxl}px`,
    borderBottom: `1px solid ${d.border}`,
  };
}

function upButton(atRoots: boolean, d: Dir): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: SPACE.sm,
    background: d.surface2,
    border: `1px solid ${d.border}`,
    borderRadius: RADIUS.md,
    padding: `${SPACE.xs}px ${SPACE.lg}px`,
    cursor: atRoots ? "default" : "pointer",
    opacity: atRoots ? 0.45 : 1,
    color: d.textMid,
    fontFamily: SANS,
    fontSize: FONT.sm,
  };
}

function pathInput(d: Dir): CSSProperties {
  return {
    flex: 1,
    minWidth: 0,
    background: d.surface,
    border: `1px solid ${d.border}`,
    borderRadius: RADIUS.md,
    padding: `${SPACE.xs}px ${SPACE.md}px`,
    color: d.text,
    fontFamily: MONO,
    fontSize: FONT.sm,
  };
}

function goButton(d: Dir): CSSProperties {
  return {
    background: d.surface2,
    border: `1px solid ${d.border}`,
    borderRadius: RADIUS.md,
    padding: `${SPACE.xs}px ${SPACE.lg}px`,
    cursor: "pointer",
    color: d.textMid,
    fontFamily: SANS,
    fontSize: FONT.sm,
    fontWeight: WEIGHT.semibold,
  };
}

function placeholder(color: string): CSSProperties {
  return { color, padding: SPACE.xxl, fontFamily: SANS, fontSize: FONT.md };
}

function entryButton(d: Dir): CSSProperties {
  return {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: SPACE.lg,
    padding: `${SPACE.lg}px ${SPACE.xxl}px`,
    border: "none",
    borderBottom: `1px solid ${d.border}`,
    background: "transparent",
    cursor: "pointer",
    textAlign: "left",
    color: d.text,
    fontFamily: MONO,
    fontSize: FONT.sm,
  };
}

function footerRow(d: Dir): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: SPACE.md,
    padding: `${SPACE.lg}px ${SPACE.xxl}px`,
    borderTop: `1px solid ${d.border}`,
  };
}

function cancelButton(d: Dir): CSSProperties {
  return {
    background: d.surface2,
    border: `1px solid ${d.border}`,
    borderRadius: RADIUS.lg,
    padding: `${SPACE.md}px ${SPACE.xxl}px`,
    cursor: "pointer",
    color: d.textMid,
    fontFamily: SANS,
    fontSize: FONT.md,
    fontWeight: WEIGHT.semibold,
  };
}

function selectButton(atRoots: boolean, d: Dir): CSSProperties {
  return {
    background: atRoots ? d.surface2 : `linear-gradient(135deg, ${d.accent}, ${d.accentDark})`,
    color: atRoots ? d.textMuted : "#FFF",
    border: "none",
    borderRadius: RADIUS.lg,
    padding: `${SPACE.md}px ${SPACE.xxl}px`,
    cursor: atRoots ? "default" : "pointer",
    fontFamily: SANS,
    fontSize: FONT.md,
    fontWeight: WEIGHT.heavy,
  };
}

export interface FolderPickerProps {
  d: Dir;
  initialPath?: string;
  onSelect: (path: string) => void;
  onClose: () => void;
}

interface ListTarget {
  path?: string;
  entry?: string;
}

function fieldTextFor(listing: DirectoryListing | null): string {
  return !listing || listing.isRootList ? "" : listing.path;
}

export function FolderPicker({ d, initialPath, onSelect, onClose }: FolderPickerProps) {
  const [listing, setListing] = useState<DirectoryListing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<ListTarget>({
    path: initialPath,
    entry: undefined,
  });
  const [typed, setTyped] = useState(initialPath ?? "");
  const typedNow = useRef(typed);
  const listingNow = useRef(listing);

  useEffect(() => {
    typedNow.current = typed;
    listingNow.current = listing;
  });

  useEffect(() => {
    let cancelled = false;
    const sentWith = typedNow.current;
    setLoading(true);
    fetchDirectories(target.path, target.entry)
      .then((result) => {
        if (!cancelled) {
          setListing(result);
          setError(null);
          if (typedNow.current === sentWith) {
            setTyped(fieldTextFor(result));
          }
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to read directory");
          setTyped(fieldTextFor(listingNow.current));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [target]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const atRoots = listing?.isRootList ?? true;
  const currentPath = listing?.path ?? "";

  function goTo(path: string) {
    setTarget({ path, entry: undefined });
  }

  function open(entry: string) {
    setTarget(
      atRoots
        ? { path: entry, entry: undefined }
        : { path: currentPath, entry },
    );
  }

  return (
    <div onClick={onClose} style={BACKDROP}>
      <div
        onClick={(e) => e.stopPropagation()}
        data-testid="folder-picker"
        style={dialog(d)}
      >
        <div style={headerRow(d)}>
          <Folder size={ICON.lg} style={{ color: d.accent }} />
          <div style={headerTitle(d)}>Choose project folder</div>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={closeButton(d)}>
            <X size={ICON.lg} />
          </button>
        </div>

        <div style={breadcrumbRow(d)}>
          <button
            onClick={() =>
              setTarget({
                path: listing?.parent ?? undefined,
                entry: undefined,
              })
            }
            disabled={atRoots}
            title={atRoots ? "Already at the top" : "Up one level"}
            style={upButton(atRoots, d)}
          >
            <ArrowUp size={ICON.sm} /> Up
          </button>
          <input
            aria-label="Folder path"
            value={typed}
            placeholder="Start in… or paste a folder path"
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                goTo(typed);
              }
            }}
            style={pathInput(d)}
          />
          <button onClick={() => goTo(typed)} style={goButton(d)}>Go</button>
        </div>

        <div style={{ flex: 1, minHeight: LIST_MIN_HEIGHT, overflowY: "auto" }}>
          {error && <div role="alert" style={placeholder(ERROR_RED)}>{error}</div>}
          {loading && <div style={placeholder(d.textMuted)}>Loading…</div>}
          {!loading && listing?.entries.length === 0 && (
            <div style={placeholder(d.textMuted)}>
              No sub-folders here — Select this folder to use it.
            </div>
          )}
          {!loading && listing?.entries.map((entry) => (
            <button key={entry} onClick={() => open(entry)} style={entryButton(d)}>
              {atRoots ? <HardDrive size={ICON.sm} style={{ color: d.textMuted }} /> : <Folder size={ICON.sm} style={{ color: d.accent }} />}
              {entry}
            </button>
          ))}
        </div>

        <div style={footerRow(d)}>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={cancelButton(d)}>Cancel</button>
          <button
            onClick={() => onSelect(currentPath)}
            disabled={atRoots || currentPath === ""}
            title={atRoots ? "Open a folder first" : `Use ${currentPath}`}
            style={selectButton(atRoots, d)}
          >
            Select this folder
          </button>
        </div>
      </div>
    </div>
  );
}
