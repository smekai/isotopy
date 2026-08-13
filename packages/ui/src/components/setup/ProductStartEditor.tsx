import type { ProjectAutomationConfig, UiAutomation } from "@isotopy/core";
import type { Dir } from "../../theme";
import { fieldLabel, mutedCaption } from "./setup-styles";
import { defaultUiAutomation } from "./automation-config";
import {
  BLOCK_ROW,
  FIELD_STACK,
  blockTitle,
  inputStyle,
  toggleButton,
} from "./automation-styles";
import { CommandFields } from "./CommandFields";

export interface ProductStartEditorProps {
  d: Dir;
  config: ProjectAutomationConfig;
  onChange: (config: ProjectAutomationConfig) => void;
}

export function ProductStartEditor({ d, config, onChange }: ProductStartEditorProps) {
  const ui = config.ui;

  function setUi(start: UiAutomation | undefined) {
    const next = { ...config };
    if (start === undefined) {
      delete next.ui;
      onChange(next);
      return;
    }
    onChange({ ...next, ui: start });
  }

  return (
    <div>
      <div style={blockTitle(d)}>Start the product</div>
      <div style={mutedCaption(d)}>
        How Isotopy starts what your project builds, so a finished run can show it.
      </div>
      <div style={{ ...BLOCK_ROW, marginTop: 12 }}>
        <button
          onClick={() => setUi(ui === undefined ? defaultUiAutomation() : undefined)}
          style={toggleButton(ui !== undefined, d)}
        >
          {ui === undefined ? "Configure a start command" : "Remove the start command"}
        </button>
      </div>
      {ui !== undefined && (
        <>
          <CommandFields
            d={d}
            name="Start"
            command={ui.start}
            onChange={(start) => setUi({ ...ui, start })}
          />
          <div style={FIELD_STACK}>
            <label>
              <div style={fieldLabel(d)}>Ready when this URL responds</div>
              <input
                aria-label="Start health URL"
                placeholder="http://localhost:3000"
                value={ui.healthUrl}
                onChange={(event) => setUi({ ...ui, healthUrl: event.target.value })}
                style={inputStyle(d)}
              />
            </label>
          </div>
        </>
      )}
    </div>
  );
}
