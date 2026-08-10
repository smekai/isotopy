import { Trash2 } from "lucide-react";
import type { ValidationCommand } from "@adhd/core";
import { ICON } from "../../theme";
import type { Dir } from "../../theme";
import { fieldLabel, mutedCaption } from "./setup-styles";
import { defaultValidationCommand } from "./automation-config";
import {
  BLOCK_ROW,
  FIELD_STACK,
  blockTitle,
  inputStyle,
  toggleButton,
} from "./automation-styles";
import { CommandFields } from "./CommandFields";

export interface ValidationCommandsEditorProps {
  d: Dir;
  commands: ValidationCommand[];
  onChange: (commands: ValidationCommand[]) => void;
}

export function ValidationCommandsEditor({
  d,
  commands,
  onChange,
}: ValidationCommandsEditorProps) {
  function replace(index: number, command: ValidationCommand) {
    onChange(commands.map((current, at) => (at === index ? command : current)));
  }

  return (
    <div>
      <div style={blockTitle(d)}>Validation commands</div>
      <div style={mutedCaption(d)}>
        The checks this project owns — what QA and the Release Manager run before a release.
      </div>
      {commands.map((command, index) => (
        <div key={command.id}>
          <div style={FIELD_STACK}>
            <label>
              <div style={fieldLabel(d)}>Name</div>
              <input
                aria-label={`Validation ${index + 1} label`}
                value={command.label}
                onChange={(event) => replace(index, { ...command, label: event.target.value })}
                style={inputStyle(d)}
              />
            </label>
          </div>
          <CommandFields
            d={d}
            name={`Validation ${index + 1}`}
            command={command.command}
            onChange={(next) => replace(index, { ...command, command: next })}
          />
          <div style={{ ...BLOCK_ROW, marginTop: 12 }}>
            <button
              aria-label={`Remove validation ${index + 1}`}
              onClick={() => onChange(commands.filter((_, at) => at !== index))}
              style={toggleButton(false, d)}
            >
              <Trash2 size={ICON.sm} /> Remove
            </button>
          </div>
        </div>
      ))}
      <div style={BLOCK_ROW}>
        <button
          onClick={() => onChange([...commands, defaultValidationCommand(commands)])}
          style={toggleButton(false, d)}
        >
          Add a validation command
        </button>
      </div>
    </div>
  );
}
