import type { CSSProperties } from "react";
import { Server } from "lucide-react";
import { FONT, ICON, SANS, WEIGHT } from "../../theme";
import type { Dir } from "../../theme";
import {
  OPTION_STACK,
  mutedCaption,
  optionCard,
  sectionSubtitle,
  sectionTitle,
} from "./setup-styles";

interface DeployTarget {
  id: string;
  label: string;
  desc: string;
}

const DEPLOY_TARGETS: DeployTarget[] = [
  { id: "vercel", label: "Vercel", desc: "Auto-detected from project" },
  { id: "railway", label: "Railway", desc: "railway.app" },
  { id: "fly", label: "Fly.io", desc: "fly.io" },
  { id: "custom", label: "Custom script", desc: "Run ./scripts/deploy.sh" },
];

function deployIcon(selected: boolean, d: Dir): CSSProperties {
  return { color: selected ? d.accent : d.textMuted, flexShrink: 0 };
}

function deployLabel(d: Dir): CSSProperties {
  return { color: d.text, fontFamily: SANS, fontSize: FONT.md, fontWeight: WEIGHT.semibold };
}

export interface DeploySectionProps {
  d: Dir;
}

export function DeploySection({ d }: DeploySectionProps) {
  return (
    <div>
      <div style={sectionTitle(d)}>Deploy Target</div>
      <div style={sectionSubtitle(d)}>Where the SRE deploys your release.</div>
      <div style={OPTION_STACK}>
        {DEPLOY_TARGETS.map((opt, i) => (
          <button key={opt.id} style={optionCard(i === 0, d)}>
            <Server size={ICON.md} style={deployIcon(i === 0, d)} />
            <div>
              <div style={deployLabel(d)}>{opt.label}</div>
              <div style={mutedCaption(d)}>{opt.desc}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
