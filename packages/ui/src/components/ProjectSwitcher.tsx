import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, FolderPlus, Home, Trash2 } from "lucide-react";
import { HOME_PROJECT_ID } from "@adhd/core";
import type { Project } from "@adhd/core";
import type { Dir } from "../theme";
import { MONO, SANS } from "../theme";
import { FolderPicker } from "./FolderPicker";

export interface ProjectSwitcherProps {
  d: Dir;
  projects: Project[];
  activeId: string;
  onSelect: (projectId: string) => void;
  onAdd: (root: string) => void;
  onRemove: (projectId: string) => void;
}

function triggerStyle(d: Dir, open: boolean): React.CSSProperties {
  return {
    display: "flex", alignItems: "center", gap: 5,
    background: open ? d.surface2 : "none",
    border: "none", borderRadius: 8, padding: "5px 8px", cursor: "pointer",
    color: d.textMid, fontFamily: SANS, fontSize: 13, fontWeight: 500,
  };
}

function menuStyle(d: Dir): React.CSSProperties {
  return {
    position: "absolute", top: "calc(100% + 6px)", left: 0,
    minWidth: 300, maxWidth: 420, background: d.surface,
    border: `1px solid ${d.border}`, borderRadius: 14, padding: 5,
    boxShadow: d.shadowLg, zIndex: 40,
  };
}

function rowStyle(d: Dir, selected: boolean, hovered: boolean): React.CSSProperties {
  return {
    display: "flex", alignItems: "center", gap: 9, width: "100%",
    border: "none", borderRadius: 10, padding: "9px 11px", textAlign: "left",
    background: selected ? d.accentSoft : hovered ? d.surface2 : "transparent",
    cursor: "pointer",
  };
}

const ADD_ROW_STYLE: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 9, width: "100%",
  border: "none", borderRadius: 10, padding: "9px 11px", textAlign: "left",
  background: "transparent", cursor: "pointer",
};

export function ProjectSwitcher({
  d,
  projects,
  activeId,
  onSelect,
  onAdd,
  onRemove,
}: ProjectSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const active = projects.find((project) => project.id === activeId);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-testid="project-switcher"
        style={triggerStyle(d, open)}
      >
        {active?.name ?? "Home"}
        <ChevronDown size={13} style={{ color: d.textMuted }} />
      </button>

      {open && (
        <div role="listbox" style={menuStyle(d)}>
          {projects.map((project) => {
            const selected = project.id === activeId;
            return (
              <div
                key={project.id}
                onMouseEnter={() => setHovered(project.id)}
                onMouseLeave={() => setHovered(null)}
                style={{ display: "flex", alignItems: "center" }}
              >
                <button
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onSelect(project.id);
                    setOpen(false);
                  }}
                  style={rowStyle(d, selected, hovered === project.id)}
                >
                  {project.id === HOME_PROJECT_ID && (
                    <Home size={13} style={{ color: d.textMuted, flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: selected ? d.accent : d.text, fontFamily: SANS, fontSize: 13, fontWeight: selected ? 700 : 600 }}>
                      {project.name}
                    </div>
                    <div style={{ color: d.textMuted, fontFamily: MONO, fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {project.id === HOME_PROJECT_ID ? "Scratch runs outside any project" : project.root}
                    </div>
                  </div>
                  {selected && <Check size={14} style={{ color: d.accent, flexShrink: 0 }} />}
                </button>
                {project.id !== HOME_PROJECT_ID && hovered === project.id && (
                  <button
                    onClick={() => onRemove(project.id)}
                    title="Remove from the list — the folder and its history stay on disk"
                    style={{ background: "none", border: "none", cursor: "pointer", color: d.textMuted, padding: "0 8px" }}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            );
          })}

          <div style={{ height: 1, background: d.border, margin: "5px 0" }} />

          <button
            onClick={() => {
              setPickerOpen(true);
              setOpen(false);
            }}
            onMouseEnter={() => setHovered("add")}
            onMouseLeave={() => setHovered(null)}
            style={{ ...ADD_ROW_STYLE, background: hovered === "add" ? d.surface2 : "transparent" }}
          >
            <FolderPlus size={13} style={{ color: d.accent, flexShrink: 0 }} />
            <span style={{ color: d.text, fontFamily: SANS, fontSize: 13, fontWeight: 600 }}>
              Add project…
            </span>
          </button>
        </div>
      )}

      {pickerOpen && (
        <FolderPicker
          d={d}
          onSelect={(picked) => {
            onAdd(picked);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
