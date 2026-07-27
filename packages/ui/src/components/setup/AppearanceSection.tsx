import type { CSSProperties } from "react";
import { useTheme } from "../../ThemeContext";
import { DIRS, RADIUS, focusRing } from "../../theme";
import type { Dir } from "../../theme";
import {
  OPTION_STACK,
  mutedCaption,
  optionCard,
  optionLabel,
  sectionSubtitle,
  sectionTitle,
} from "./setup-styles";

function dirSwatch(dir: Dir, selected: boolean): CSSProperties {
  return {
    width: 28,
    height: 28,
    borderRadius: RADIUS.md,
    flexShrink: 0,
    background: `linear-gradient(135deg, ${dir.accent}, ${dir.accentDark})`,
    boxShadow: selected ? focusRing(dir.accentSoft) : "none",
  };
}

export interface AppearanceSectionProps {
  d: Dir;
}

export function AppearanceSection({ d }: AppearanceSectionProps) {
  const { dirId, setDirId } = useTheme();

  return (
    <div>
      <div style={sectionTitle(d)}>Appearance</div>
      <div style={sectionSubtitle(d)}>
        Pick a visual direction for the workspace. Applies instantly.
      </div>
      <div style={OPTION_STACK}>
        {Object.values(DIRS).map((dir) => {
          const sel = dir.id === dirId;
          return (
            <button
              key={dir.id}
              onClick={() => setDirId(dir.id)}
              style={optionCard(sel, d, dir)}
            >
              <div style={dirSwatch(dir, sel)} />
              <div>
                <div style={optionLabel(d)}>{dir.label}</div>
                <div style={mutedCaption(d)}>{dir.desc}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
