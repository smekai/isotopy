import { useState } from "react";
import type { CSSProperties } from "react";
import { X } from "lucide-react";
import type { SettingsController } from "../../hooks/useSettings";
import { FONT, ICON, MOTION, RADIUS, SANS, SPACE, WEIGHT, Z } from "../../theme";
import type { Dir } from "../../theme";
import { AppearanceSection } from "./AppearanceSection";
import { DeploySection } from "./DeploySection";
import { GatesSection } from "./GatesSection";
import { HarnessSection } from "./HarnessSection";
import { FLEX_FILL, WHITE, mutedCaption } from "./setup-styles";

export type SetupSection = "harness" | "gates" | "appearance" | "deploy";

const SECTIONS: { id: SetupSection; label: string }[] = [
  { id: "harness", label: "AI Harness" },
  { id: "gates", label: "Gates" },
  { id: "appearance", label: "Appearance" },
  { id: "deploy", label: "Deploy Target" },
];

const SCRIM = "rgba(30,27,75,0.20)";

const DIALOG_WIDTH = 700;
const NAV_RAIL_WIDTH = 160;

const BACKDROP: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: Z.overlay,
  background: SCRIM,
  backdropFilter: "blur(4px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: SPACE.x5l,
};

function dialog(d: Dir): CSSProperties {
  return {
    background: WHITE,
    borderRadius: RADIUS.pill,
    width: DIALOG_WIDTH,
    maxHeight: "82vh",
    display: "flex",
    overflow: "hidden",
    boxShadow: d.elevation.lg,
  };
}

function navRail(d: Dir): CSSProperties {
  return {
    width: NAV_RAIL_WIDTH,
    background: d.surface2,
    borderRight: `1px solid ${d.border}`,
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
  };
}

function navHeader(d: Dir): CSSProperties {
  return { padding: `${SPACE.xxl}px ${SPACE.xxl}px ${SPACE.xl}px`, borderBottom: `1px solid ${d.border}` };
}

function navTitle(d: Dir): CSSProperties {
  return { color: d.text, fontFamily: SANS, fontSize: FONT.xl, fontWeight: WEIGHT.heavy };
}

function navButton(active: boolean, d: Dir): CSSProperties {
  return {
    textAlign: "left",
    padding: `${SPACE.lg}px ${SPACE.xxl}px`,
    border: "none",
    background: active ? d.accentSoft : "transparent",
    borderLeft: `3px solid ${active ? d.accent : "transparent"}`,
    color: active ? d.accent : d.textMid,
    fontFamily: SANS,
    fontSize: FONT.md,
    fontWeight: active ? 700 : 500,
    cursor: "pointer",
    transition: `all ${MOTION.fast}`,
  };
}

function navCloseButton(d: Dir): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: SPACE.md,
    padding: `${SPACE.xl}px ${SPACE.xxl}px`,
    border: "none",
    borderTop: `1px solid ${d.border}`,
    background: "transparent",
    color: d.textMuted,
    fontFamily: SANS,
    fontSize: FONT.md,
    cursor: "pointer",
  };
}

const BODY: CSSProperties = { flex: 1, overflowY: "auto", padding: SPACE.x4l };

export interface SetupModalProps {
  d: Dir;
  projectName: string;
  settings: SettingsController;
  section?: SetupSection;
  onClose: () => void;
}

export function SetupModal({
  d,
  projectName,
  settings,
  section = "harness",
  onClose,
}: SetupModalProps) {
  const [sec, setSec] = useState<SetupSection>(section);

  return (
    <div onClick={onClose} style={BACKDROP}>
      <div onClick={(e) => e.stopPropagation()} style={dialog(d)}>
        <div style={navRail(d)}>
          <div style={navHeader(d)}>
            <div style={navTitle(d)}>Setup</div>
            <div style={mutedCaption(d)}>{projectName}</div>
          </div>
          {SECTIONS.map((s) => (
            <button key={s.id} onClick={() => setSec(s.id)} style={navButton(sec === s.id, d)}>
              {s.label}
            </button>
          ))}
          <div style={FLEX_FILL} />
          <button onClick={onClose} style={navCloseButton(d)}>
            <X size={ICON.sm} /> Close
          </button>
        </div>

        <div style={BODY}>
          {sec === "appearance" && <AppearanceSection d={d} />}
          {sec === "gates" && <GatesSection d={d} />}
          {sec === "harness" && (
            <HarnessSection d={d} projectName={projectName} settings={settings} />
          )}
          {sec === "deploy" && <DeploySection d={d} />}
        </div>
      </div>
    </div>
  );
}
