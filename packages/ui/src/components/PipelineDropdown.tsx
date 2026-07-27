import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Check, ChevronDown } from "lucide-react";
import type { Dir } from "../theme";
import { FONT, ICON, MOTION, RADIUS, SANS, SPACE, WEIGHT, Z, focusRing } from "../theme";

const MENU_MIN_WIDTH = 300;

function trigger(open: boolean, d: Dir): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: SPACE.lg,
    background: "#FFF",
    border: `1.5px solid ${open ? d.accent : d.border}`,
    borderRadius: RADIUS.xl,
    padding: `${SPACE.lg}px ${SPACE.xxl}px`,
    boxShadow: open ? focusRing(d.accentSoft) : d.elevation.sm,
    cursor: "pointer",
    transition: `all ${MOTION.fast}`,
  };
}

function triggerLabel(d: Dir): CSSProperties {
  return { color: d.text, fontFamily: SANS, fontSize: FONT.lg, fontWeight: WEIGHT.bold };
}

function chevron(open: boolean, d: Dir): CSSProperties {
  return {
    color: d.textMuted,
    transform: open ? "rotate(180deg)" : "none",
    transition: `transform ${MOTION.fast}`,
  };
}

function menu(d: Dir): CSSProperties {
  return {
    position: "absolute",
    top: `calc(100% + ${SPACE.sm}px)`,
    left: "50%",
    transform: "translateX(-50%)",
    minWidth: MENU_MIN_WIDTH,
    background: "#FFF",
    border: `1px solid ${d.border}`,
    borderRadius: RADIUS.xl,
    padding: SPACE.sm,
    boxShadow: d.elevation.lg,
    zIndex: Z.dropdown,
  };
}

function menuItem(selected: boolean, hovered: boolean, d: Dir): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: SPACE.lg,
    width: "100%",
    border: "none",
    borderRadius: RADIUS.lg,
    padding: `${SPACE.lg}px ${SPACE.xl}px`,
    textAlign: "left",
    background: selected ? d.accentSoft : hovered ? d.surface2 : "transparent",
    cursor: "pointer",
    transition: `background ${MOTION.instant}`,
  };
}

function itemLabel(selected: boolean, d: Dir): CSSProperties {
  return {
    color: selected ? d.accent : d.text,
    fontFamily: SANS,
    fontSize: FONT.lg,
    fontWeight: selected ? WEIGHT.bold : WEIGHT.semibold,
  };
}

function itemDescription(d: Dir): CSSProperties {
  return { color: d.textMuted, fontFamily: SANS, fontSize: FONT.sm };
}

export interface PipelineOption {
  id: string;
  label: string;
  description: string;
}

export interface PipelineDropdownProps {
  d: Dir;
  options: PipelineOption[];
  value: string;
  onSelect: (id: string) => void;
}

export function PipelineDropdown({ d, options, value, onSelect }: PipelineDropdownProps) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((opt) => opt.id === value) ?? options[0];

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
        style={trigger(open, d)}
      >
        <span style={triggerLabel(d)}>
          {selected?.label}
        </span>
        <ChevronDown size={ICON.md} style={chevron(open, d)} />
      </button>

      {open && (
        <div role="listbox" style={menu(d)}>
          {options.map((opt) => {
            const sel = opt.id === value;
            return (
              <button
                key={opt.id}
                role="option"
                aria-selected={sel}
                onClick={() => {
                  onSelect(opt.id);
                  setOpen(false);
                }}
                onMouseEnter={() => setHovered(opt.id)}
                onMouseLeave={() => setHovered(null)}
                style={menuItem(sel, hovered === opt.id, d)}
              >
                <div style={{ flex: 1 }}>
                  <div style={itemLabel(sel, d)}>{opt.label}</div>
                  <div style={itemDescription(d)}>{opt.description}</div>
                </div>
                {sel && <Check size={ICON.md} style={{ color: d.accent, flexShrink: 0 }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
