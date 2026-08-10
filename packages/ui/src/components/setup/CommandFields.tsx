import type { AutomationCommand } from "@adhd/core";
import type { Dir } from "../../theme";
import { fieldLabel } from "./setup-styles";
import {
  argumentsFromText,
  argumentsText,
  optionalText,
  withArguments,
  withCommand,
  withWindowsExecutable,
} from "./automation-config";
import { FIELD_STACK, inputStyle } from "./automation-styles";

export interface CommandFieldsProps {
  d: Dir;
  name: string;
  command: AutomationCommand;
  onChange: (command: AutomationCommand) => void;
}

export function CommandFields({ d, name, command, onChange }: CommandFieldsProps) {
  const windowsExecutable = command.windows?.executable ?? "";

  return (
    <div style={FIELD_STACK}>
      <label>
        <div style={fieldLabel(d)}>Executable</div>
        <input
          aria-label={`${name} executable`}
          value={command.executable}
          onChange={(event) => onChange(withCommand(command, { executable: event.target.value }))}
          style={inputStyle(d)}
        />
      </label>
      <label>
        <div style={fieldLabel(d)}>Arguments — one per line</div>
        <textarea
          aria-label={`${name} arguments`}
          value={argumentsText(command.args)}
          onChange={(event) => onChange(withArguments(command, argumentsFromText(event.target.value)))}
          rows={4}
          style={inputStyle(d)}
        />
      </label>
      <label>
        <div style={fieldLabel(d)}>Windows executable — when it differs</div>
        <input
          aria-label={`${name} Windows executable`}
          placeholder="Same as above"
          value={windowsExecutable}
          onChange={(event) => onChange(withWindowsExecutable(command, event.target.value))}
          style={inputStyle(d)}
        />
      </label>
      <label>
        <div style={fieldLabel(d)}>Working directory — project-relative</div>
        <input
          aria-label={`${name} working directory`}
          placeholder="Project root"
          value={command.cwd ?? ""}
          onChange={(event) =>
            onChange(withCommand(command, { cwd: optionalText(event.target.value) }))
          }
          style={inputStyle(d)}
        />
      </label>
    </div>
  );
}
