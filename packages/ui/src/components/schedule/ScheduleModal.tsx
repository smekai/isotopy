import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { X } from "lucide-react";
import type { ScheduleView } from "@isotopy/core";
import type { CreateScheduleBody } from "../../api";
import type { Dir } from "../../theme";
import { FONT, ICON, MONO, RADIUS, SANS, SPACE, STATUS_COLORS, WEIGHT, Z } from "../../theme";
import { mutedLine } from "./schedule-styles";
import { SOLO_READER } from "./schedule-team";

const SCRIM = "rgba(30,27,75,0.20)";
const DIALOG_WIDTH = 520;

const BACKDROP: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: SCRIM,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: Z.overlay,
};

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
  return {
    background: "none",
    border: "none",
    padding: 0,
    cursor: "pointer",
    color: d.textMuted,
  };
}

function fieldLabel(d: Dir): CSSProperties {
  return {
    display: "flex",
    flexDirection: "column",
    gap: SPACE.xs,
    color: d.textMid,
    fontSize: FONT.md,
    fontWeight: WEIGHT.semibold,
  };
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

function actions(): CSSProperties {
  return { display: "flex", justifyContent: "flex-end", gap: SPACE.md };
}

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

function errorText(): CSSProperties {
  return { color: STATUS_COLORS.failed.text, fontSize: FONT.md, fontFamily: SANS };
}

export interface ScheduleModalProps {
  schedule?: ScheduleView;
  error: string | null;
  d: Dir;
  onSave: (body: CreateScheduleBody) => void;
  onDismiss: () => void;
}

export function ScheduleModal({
  schedule,
  error,
  d,
  onSave,
  onDismiss,
}: ScheduleModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusTo = useRef<Element | null>(null);
  const [name, setName] = useState(schedule?.name ?? "");
  const [cron, setCron] = useState(schedule?.cron ?? "0 9 * * *");
  const [timezone, setTimezone] = useState(
    schedule?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [task, setTask] = useState(schedule?.task ?? "");

  useEffect(() => {
    restoreFocusTo.current = document.activeElement;
    dialogRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onDismiss();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const restore = restoreFocusTo.current;
      if (restore instanceof HTMLElement) {
        restore.focus();
      }
    };
  }, [onDismiss]);

  const title = schedule ? "Edit schedule" : "New schedule";

  return (
    <div style={BACKDROP} onClick={onDismiss}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        data-testid="schedule-modal"
        onClick={(event) => event.stopPropagation()}
        style={dialog(d)}
      >
        <div style={header(d)}>
          {title}
          <button type="button" onClick={onDismiss} aria-label="Close" style={closeButton(d)}>
            <X size={ICON.md} />
          </button>
        </div>

        <label style={fieldLabel(d)}>
          Name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            data-testid="schedule-name"
            style={input(d)}
          />
        </label>

        <label style={fieldLabel(d)}>
          Cron expression
          <input
            value={cron}
            onChange={(event) => setCron(event.target.value)}
            data-testid="schedule-cron"
            style={input(d, true)}
          />
        </label>

        <label style={fieldLabel(d)}>
          Time zone
          <input
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
            data-testid="schedule-timezone"
            style={input(d)}
          />
        </label>

        <label style={fieldLabel(d)}>
          What the team should do
          <textarea
            value={task}
            rows={3}
            onChange={(event) => setTask(event.target.value)}
            data-testid="schedule-task"
            style={input(d)}
          />
        </label>

        <div style={mutedLine(d)}>
          {schedule
            ? "The next run time is computed by the server and shown in your own zone."
            : "One persona, one step. The Orchestrator reviews each run as it settles."}
        </div>

        {error !== null && (
          <div data-testid="schedule-error" style={errorText()}>
            {error}
          </div>
        )}

        <div style={actions()}>
          <button type="button" onClick={onDismiss} style={secondaryButton(d)}>
            Cancel
          </button>
          <button
            type="button"
            data-testid="schedule-save"
            onClick={() =>
              onSave({ name, cron, timezone, task, team: schedule?.team ?? SOLO_READER })
            }
            style={primaryButton(d)}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
