import { useEffect, useState } from "react";
import { ArrowUp, Folder, HardDrive, X } from "lucide-react";
import { fetchDirectories } from "../api";
import type { DirectoryListing } from "../api";
import type { Dir } from "../theme";
import { MONO, SANS } from "../theme";

/**
 * Modal for choosing the directory a run works in, so the path never has to be
 * typed from memory. Lists directories only — it is a picker, not a file browser.
 */
export function FolderPicker({
  d,
  initialPath,
  onSelect,
  onClose,
}: {
  d: Dir;
  /** Directory to open at; falls back to the roots. */
  initialPath?: string;
  onSelect: (path: string) => void;
  onClose: () => void;
}) {
  const [listing, setListing] = useState<DirectoryListing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  /** Where to list next: a base path plus an optional child to descend into. */
  const [target, setTarget] = useState<{ path?: string; entry?: string }>({ path: initialPath });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchDirectories(target.path, target.entry)
      .then((result) => {
        if (!cancelled) {
          setListing(result);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to read directory");
          setListing(null);
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

  function open(entry: string) {
    // Root entries are already absolute paths; children are joined server-side.
    setTarget(atRoots ? { path: entry } : { path: currentPath, entry });
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 60,
        background: "rgba(30,27,75,0.20)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 40,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        data-testid="folder-picker"
        style={{
          width: 560, maxHeight: "70vh", display: "flex", flexDirection: "column",
          background: d.surface, border: `1px solid ${d.border}`, borderRadius: 16,
          boxShadow: d.shadowLg, overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: `1px solid ${d.border}` }}>
          <Folder size={15} style={{ color: d.accent }} />
          <div style={{ color: d.text, fontFamily: SANS, fontSize: 14, fontWeight: 700 }}>
            Choose project folder
          </div>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: d.textMuted, padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderBottom: `1px solid ${d.border}` }}>
          <button
            onClick={() => setTarget({ path: listing?.parent ?? undefined })}
            disabled={atRoots}
            title={atRoots ? "Already at the top" : "Up one level"}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              background: d.surface2, border: `1px solid ${d.border}`, borderRadius: 8,
              padding: "4px 9px", cursor: atRoots ? "default" : "pointer",
              opacity: atRoots ? 0.45 : 1, color: d.textMid, fontFamily: SANS, fontSize: 11,
            }}
          >
            <ArrowUp size={11} /> Up
          </button>
          <div style={{ color: d.textMid, fontFamily: MONO, fontSize: 11, wordBreak: "break-all" }}>
            {atRoots ? "Start in…" : currentPath}
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 140, overflowY: "auto" }}>
          {error && (
            <div style={{ color: "#DC2626", padding: 16, fontFamily: SANS, fontSize: 12 }}>{error}</div>
          )}
          {!error && loading && (
            <div style={{ color: d.textMuted, padding: 16, fontFamily: SANS, fontSize: 12 }}>Loading…</div>
          )}
          {!error && !loading && listing?.entries.length === 0 && (
            <div style={{ color: d.textMuted, padding: 16, fontFamily: SANS, fontSize: 12 }}>
              No sub-folders here — Select this folder to use it.
            </div>
          )}
          {!error && !loading && listing?.entries.map((entry) => (
            <button
              key={entry}
              onClick={() => open(entry)}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 9,
                padding: "9px 16px", border: "none", borderBottom: `1px solid ${d.border}`,
                background: "transparent", cursor: "pointer", textAlign: "left",
                color: d.text, fontFamily: MONO, fontSize: 11,
              }}
            >
              {atRoots ? <HardDrive size={12} style={{ color: d.textMuted }} /> : <Folder size={12} style={{ color: d.accent }} />}
              {entry}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderTop: `1px solid ${d.border}` }}>
          <div style={{ flex: 1 }} />
          <button
            onClick={onClose}
            style={{
              background: d.surface2, border: `1px solid ${d.border}`, borderRadius: 9,
              padding: "7px 14px", cursor: "pointer", color: d.textMid,
              fontFamily: SANS, fontSize: 12, fontWeight: 600,
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => onSelect(currentPath)}
            disabled={atRoots || currentPath === ""}
            title={atRoots ? "Open a folder first" : `Use ${currentPath}`}
            style={{
              background: atRoots ? d.surface2 : `linear-gradient(135deg, ${d.accent}, ${d.accentDark})`,
              color: atRoots ? d.textMuted : "#FFF",
              border: "none", borderRadius: 9, padding: "7px 16px",
              cursor: atRoots ? "default" : "pointer",
              fontFamily: SANS, fontSize: 12, fontWeight: 800,
            }}
          >
            Select this folder
          </button>
        </div>
      </div>
    </div>
  );
}
