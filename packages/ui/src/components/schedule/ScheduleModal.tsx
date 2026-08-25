import { useState } from "react";
import type { CSSProperties } from "react";
import { X } from "lucide-react";
import { Dialog } from "../Dialog";
import type { CreateScheduleInput, ScheduleView } from "@isotopy/core";
import type { Dir } from "../../theme";
import { FONT, ICON, MONO, RADIUS, SANS, SPACE, WEIGHT } from "../../theme";
import { ERROR_RED, fieldLabel, mutedCaption } from "../setup/setup-styles";
import { SOLO_READER } from "./schedule-team";

const DIALOG_WIDTH = 520;

function dialog(d: Dir): CSSProperties {
  return {
    width: DIALOG_WIDTH,
    maxWidth: "90vw",
    background: d.surface,
    border: `1px solid ${d.border}`,
    borderRadius: RADIUS.xl,
    padding: SPACE.x4l,
    display: "flex",
    flexDirection: "column",
    gap: SPACE.xl,
    fontFamily: SANS,
  };
}

function header(d: Dir): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    color: d.text,
    fontSize: FONT.xxl,
    fontWeight: WEIGHT.semibold,
  };
}

function closeButton(d: Dir): CSSProperties {
  return { background: "none", border: "none", padding: 0, cursor: "pointer", color: d.textMuted };
}

function field(d: Dir): CSSProperties {
  return { ...fieldLabel(d, 0), display: "flex", flexDirection: "column", gap: SPACE.xs };
}

function input(d: Dir, mono = false): CSSProperties {
  return {
    background: d.surface2,
    border: `1px solid ${d.border}`,
    borderRadius: RADIUS.md,
    padding: `${SPACE.lg}px ${SPACE.xl}px`,
    color: d.text,
    fontFamily: mono ? MONO : SANS,
    fontSize: FONT.lg,
    fontWeight: WEIGHT.medium,
  };
}

const ACTIONS: CSSProperties = { display: "flex", justifyContent: "flex-end", gap: SPACE.md };

function primaryButton(d: Dir): CSSProperties {
  return {
    background: d.accent,
    color: d.accentText,
    border: "none",
    borderRadius: RADIUS.lg,
    padding: `${SPACE.lg}px ${SPACE.x4l}px`,
    cursor: "pointer",
    fontFamily: SANS,
    fontSize: FONT.lg,
    fontWeight: WEIGHT.semibold,
  };
}

function secondaryButton(d: Dir): CSSProperties {
  return {
    background: "none",
    color: d.textMid,
    border: `1px solid ${d.border}`,
    borderRadius: RADIUS.lg,
    padding: `${SPACE.lg}px ${SPACE.x4l}px`,
    cursor: "pointer",
    fontFamily: SANS,
    fontSize: FONT.lg,
  };
}

const ERROR_TEXT: CSSProperties = { color: ERROR_RED, fontSize: FONT.md, fontFamily: SANS };

export interface ScheduleModalProps {
  schedule?: ScheduleView;
  error: string | null;
  d: Dir;
  onSave: (body: CreateScheduleInput) => void;
  onDismiss: () => void;
}

export function ScheduleModal({ schedule, error, d, onSave, onDismiss }: ScheduleModalProps) {
  const [name, setName] = useState(schedule?.name ?? "");
  const [cron, setCron] = useState(schedule?.cron ?? "0 9 * * *");
  const [timezone, setTimezone] = useState(
    schedule?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [task, setTask] = useState(schedule?.task ?? "");
  const title = schedule ? "Edit schedule" : "New schedule";
  const team = schedule === undefined ? SOLO_READER : schedule.team;

  return (
    <Dialog
      label={title}
      testId="schedule-modal"
      panelStyle={dialog(d)}
      onDismiss={onDismiss}
    >
        <div style={header(d)}>
          {title}
          <button type="button" onClick={onDismiss} aria-label="Close" style={closeButton(d)}>
            <X size={ICON.md} />
          </button>
        </div>

        <label style={field(d)}>
          Name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            data-testid="schedule-name"
            style={input(d)}
          />
        </label>

        <label style={field(d)}>
          Cron expression
          <input
            value={cron}
            onChange={(event) => setCron(event.target.value)}
            data-testid="schedule-cron"
            style={input(d, true)}
          />
        </label>

        <label style={field(d)}>
          Time zone
          <input
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
            data-testid="schedule-timezone"
            style={input(d)}
          />
        </label>

        <label style={field(d)}>
          What the team should do
          <textarea
            value={task}
            rows={3}
            onChange={(event) => setTask(event.target.value)}
            data-testid="schedule-task"
            style={input(d)}
          />
        </label>

        <div style={mutedCaption(d)}>
          {schedule
            ? "The next run time is computed by the server and shown in your own zone."
            : "One persona, one step. The Orchestrator reviews each run as it settles."}
        </div>

        {error !== null && (
          <div data-testid="schedule-error" style={ERROR_TEXT}>
            {error}
          </div>
        )}

        <div style={ACTIONS}>
          <button type="button" onClick={onDismiss} style={secondaryButton(d)}>
            Cancel
          </button>
          <button
            type="button"
            data-testid="schedule-save"
            onClick={() =>
              onSave({ name, cron, timezone, task, team })
            }
            style={primaryButton(d)}
          >
            Save
          </button>
      </div>
    </Dialog>
  );
}
