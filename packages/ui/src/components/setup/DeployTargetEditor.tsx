import { Check, Server } from "lucide-react";
import type { DeploymentAutomation, DeploymentEnvironment } from "@isotopy/core";
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
import { BUTTON_ROW, FIELD_STACK, blockTitle, inputStyle, toggleButton } from "./automation-styles";
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
    if (next.rollback === undefined) delete next.rollback;
    if (next.verification === undefined) delete next.verification;
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
            {environment === "production" && (
              <label>
                <div style={fieldLabel(d)}>Check after deploy</div>
                <textarea
                  aria-label={`${environment} verification instructions`}
                  placeholder="What the QA Engineer checks on the live product, reading only. Empty: no check."
                  value={target.verification?.instructions ?? ""}
                  onChange={(event) => {
                    const instructions = optionalText(event.target.value);
                    change({ verification: instructions === undefined ? undefined : { instructions } });
                  }}
                  rows={3}
                  style={inputStyle(d)}
                />
              </label>
            )}
          </div>
          {environment === "production" && (
            <>
              <div style={blockTitle(d)}>Rollback</div>
              <div style={mutedCaption(d)}>
                Redeploys an earlier commit. It receives the commit in ISOTOPY_ROLLBACK_REF.
              </div>
              <div style={BUTTON_ROW}>
                <button
                  aria-label={`${environment} rollback command toggle`}
                  onClick={() =>
                    change({ rollback: target.rollback === undefined ? { ...target.command } : undefined })
                  }
                  style={toggleButton(target.rollback !== undefined, d)}
                >
                  {target.rollback === undefined ? "Add a rollback command" : "Remove the rollback command"}
                </button>
              </div>
              {target.rollback !== undefined && (
                <CommandFields
                  d={d}
                  name={`${environment} rollback`}
                  command={target.rollback}
                  onChange={(rollback) => change({ rollback })}
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
