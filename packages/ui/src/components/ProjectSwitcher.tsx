import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, FolderPlus, Home, Trash2 } from "lucide-react";
import { HOME_PROJECT_ID } from "@isotopy/core";
import type { Project } from "@isotopy/core";
import type { Dir } from "../theme";
import { FONT, ICON, MONO, RADIUS, SANS, SPACE, WEIGHT, Z } from "../theme";
import { FolderPicker } from "./FolderPicker";

const MENU_MIN_WIDTH = 300;
const MENU_MAX_WIDTH = 420;

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
    display: "flex", alignItems: "center", gap: SPACE.sm,
    background: open ? d.surface2 : "none",
    border: "none", borderRadius: RADIUS.md, padding: `${SPACE.sm}px ${SPACE.md}px`, cursor: "pointer",
    color: d.textMid, fontFamily: SANS, fontSize: FONT.lg, fontWeight: WEIGHT.medium,
  };
}

function menuStyle(d: Dir): React.CSSProperties {
  return {
    position: "absolute", top: `calc(100% + ${SPACE.sm}px)`, left: 0,
    minWidth: MENU_MIN_WIDTH, maxWidth: MENU_MAX_WIDTH, background: d.surface,
    border: `1px solid ${d.border}`, borderRadius: RADIUS.xl, padding: SPACE.sm,
    boxShadow: d.elevation.lg, zIndex: Z.popover,
  };
}

const ROW_BASE: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: SPACE.lg, width: "100%",
  border: "none", borderRadius: RADIUS.lg, padding: `${SPACE.lg}px ${SPACE.xl}px`, textAlign: "left",
  cursor: "pointer",
};

function rowStyle(d: Dir, selected: boolean, hovered: boolean): React.CSSProperties {
  return {
    ...ROW_BASE,
    background: selected ? d.accentSoft : hovered ? d.surface2 : "transparent",
  };
}

function projectName(d: Dir, selected: boolean): React.CSSProperties {
  return {
    color: selected ? d.accent : d.text,
    fontFamily: SANS,
    fontSize: FONT.lg,
    fontWeight: selected ? WEIGHT.bold : WEIGHT.semibold,
  };
}

function projectPath(d: Dir): React.CSSProperties {
  return {
    color: d.textMuted,
    fontFamily: MONO,
    fontSize: FONT.xs,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };
}

function removeButton(d: Dir): React.CSSProperties {
  return { background: "none", border: "none", cursor: "pointer", color: d.textMuted, padding: `0 ${SPACE.md}px` };
}

function separator(d: Dir): React.CSSProperties {
  return { height: 1, background: d.border, margin: `${SPACE.sm}px 0` };
}

function addRowStyle(d: Dir, hovered: boolean): React.CSSProperties {
  return { ...ROW_BASE, background: hovered ? d.surface2 : "transparent" };
}

function addLabel(d: Dir): React.CSSProperties {
  return { color: d.text, fontFamily: SANS, fontSize: FONT.lg, fontWeight: WEIGHT.semibold };
}

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
        <ChevronDown size={ICON.md} style={{ color: d.textMuted }} />
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
                    <Home size={ICON.md} style={{ color: d.textMuted, flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={projectName(d, selected)}>{project.name}</div>
                    <div style={projectPath(d)}>
                      {project.id === HOME_PROJECT_ID ? "Scratch runs outside any project" : project.root}
                    </div>
                  </div>
                  {selected && <Check size={ICON.md} style={{ color: d.accent, flexShrink: 0 }} />}
                </button>
                {project.id !== HOME_PROJECT_ID && hovered === project.id && (
                  <button
                    onClick={() => onRemove(project.id)}
                    title="Remove from the list — the folder and its history stay on disk"
                    style={removeButton(d)}
                  >
                    <Trash2 size={ICON.md} />
                  </button>
                )}
              </div>
            );
          })}

          <div style={separator(d)} />

          <button
            onClick={() => {
              setPickerOpen(true);
              setOpen(false);
            }}
            onMouseEnter={() => setHovered("add")}
            onMouseLeave={() => setHovered(null)}
            style={addRowStyle(d, hovered === "add")}
          >
            <FolderPlus size={ICON.md} style={{ color: d.accent, flexShrink: 0 }} />
            <span style={addLabel(d)}>Add project…</span>
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
