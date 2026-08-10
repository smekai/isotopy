import { Check, Server } from "lucide-react";
import type { DeploymentAutomation, DeploymentEnvironment } from "@adhd/core";
import { ICON, SANS, WEIGHT } from "../../theme";
import type { Dir } from "../../theme";
import {
  FLEX_FILL,
  OPTION_STACK,
  fieldLabel,
  mutedCaption,
  optionCard,
} from "./setup-styles";
import { DEPLOYMENT_OPTIONS, deploymentPreset, optionalText } from "./automation-config";
import type { DeploymentOption } from "./automation-config";
import { FIELD_STACK, inputStyle } from "./automation-styles";
import { CommandFields } from "./CommandFields";

export interface DeployTargetEditorProps {
  d: Dir;
  environment: DeploymentEnvironment;
  target: DeploymentAutomation | undefined;
  onChange: (target: DeploymentAutomation | undefined) => void;
}

function optionLabelStyle(d: Dir) {
  return { color: d.text, fontFamily: SANS, fontWeight: WEIGHT.semibold };
}

export function DeployTargetEditor({
  d,
  environment,
  target,
  onChange,
}: DeployTargetEditorProps) {
  function select(option: DeploymentOption) {
    onChange(option.id === "disabled" ? undefined : deploymentPreset(option.id));
  }

  function change(update: Partial<DeploymentAutomation>) {
    if (target === undefined) {
      return;
    }
    const next: DeploymentAutomation = { ...target, ...update };
    if (next.url === undefined) delete next.url;
    if (next.healthUrl === undefined) delete next.healthUrl;
    if (next.rollbackNotes === undefined) delete next.rollbackNotes;
    onChange(next);
  }

  return (
    <div>
      <div style={OPTION_STACK}>
        {DEPLOYMENT_OPTIONS.map((option) => {
          const selected = (target?.provider ?? "disabled") === option.id;
          return (
            <button
              key={option.id}
              aria-label={`${environment} ${option.label}`}
              onClick={() => select(option)}
              style={optionCard(selected, d)}
            >
              <Server
                size={ICON.md}
                style={{ color: selected ? d.accent : d.textMuted, flexShrink: 0 }}
              />
              <div style={FLEX_FILL}>
                <div style={optionLabelStyle(d)}>{option.label}</div>
                <div style={mutedCaption(d)}>{option.description}</div>
              </div>
              {selected && <Check size={ICON.md} color={d.accent} />}
            </button>
          );
        })}
      </div>

      {target !== undefined && (
        <>
          <CommandFields
            d={d}
            name={`${environment} deploy`}
            command={target.command}
            onChange={(command) => change({ command })}
          />
          <div style={FIELD_STACK}>
            <label>
              <div style={fieldLabel(d)}>Deployment URL</div>
              <input
                aria-label={`${environment} deployment URL`}
                placeholder="Reported by the command, or fixed here"
                value={target.url ?? ""}
                onChange={(event) => change({ url: optionalText(event.target.value) })}
                style={inputStyle(d)}
              />
            </label>
            <label>
              <div style={fieldLabel(d)}>Health URL</div>
              <input
                aria-label={`${environment} health URL`}
                placeholder="Defaults to the deployment URL"
                value={target.healthUrl ?? ""}
                onChange={(event) => change({ healthUrl: optionalText(event.target.value) })}
                style={inputStyle(d)}
              />
            </label>
            <label>
              <div style={fieldLabel(d)}>Rollback notes</div>
              <textarea
                aria-label={`${environment} rollback notes`}
                value={target.rollbackNotes ?? ""}
                onChange={(event) => change({ rollbackNotes: optionalText(event.target.value) })}
                rows={3}
                style={inputStyle(d)}
              />
            </label>
          </div>
        </>
      )}
    </div>
  );
}
