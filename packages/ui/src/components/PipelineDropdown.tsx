import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import type { Dir } from "../theme";
import { SANS } from "../theme";

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
        style={{
          display: "flex", alignItems: "center", gap: 10,
          background: "#FFF", border: `1.5px solid ${open ? d.accent : d.border}`,
          borderRadius: 12, padding: "9px 14px",
          boxShadow: open ? `0 0 0 3px ${d.accentSoft}` : d.shadowSm,
          cursor: "pointer", transition: "all 0.15s",
        }}
      >
        <span style={{ color: d.text, fontFamily: SANS, fontSize: 13, fontWeight: 700 }}>
          {selected?.label}
        </span>
        <ChevronDown
          size={14}
          style={{ color: d.textMuted, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}
        />
      </button>

      {open && (
        <div
          role="listbox"
          style={{
            position: "absolute", top: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)",
            minWidth: 300, background: "#FFF", border: `1px solid ${d.border}`,
            borderRadius: 14, padding: 5, boxShadow: d.shadowLg, zIndex: 30,
          }}
        >
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
                style={{
                  display: "flex", alignItems: "center", gap: 10, width: "100%",
                  border: "none", borderRadius: 10, padding: "10px 12px", textAlign: "left",
                  background: sel ? d.accentSoft : hovered === opt.id ? d.surface2 : "transparent",
                  cursor: "pointer", transition: "background 0.1s",
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ color: sel ? d.accent : d.text, fontFamily: SANS, fontSize: 13, fontWeight: sel ? 700 : 600 }}>
                    {opt.label}
                  </div>
                  <div style={{ color: d.textMuted, fontFamily: SANS, fontSize: 11 }}>{opt.description}</div>
                </div>
                {sel && <Check size={14} style={{ color: d.accent, flexShrink: 0 }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
