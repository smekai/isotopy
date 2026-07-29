import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type {
  DeploymentAutomation,
  ProjectAutomationConfig,
} from "@adhd/core";
import { Check, Server } from "lucide-react";
import {
  fetchAutomationConfig,
  updateAutomationConfig,
} from "../../api";
import { FONT, ICON, RADIUS, SANS, SPACE, WEIGHT } from "../../theme";
import type { Dir } from "../../theme";
import {
  ERROR_RED,
  FLEX_FILL,
  OK_GREEN,
  OPTION_STACK,
  fieldLabel,
  mutedCaption,
  optionCard,
  sectionSubtitle,
  sectionTitle,
} from "./setup-styles";
import {
  DEPLOYMENT_OPTIONS,
  argumentsFromText,
  argumentsText,
  deploymentPreset,
} from "./deploy-config";

type Environment = "preview" | "production";

const ENVIRONMENTS: { id: Environment; label: string }[] = [
  { id: "preview", label: "Preview" },
  { id: "production", label: "Production" },
];

const ENVIRONMENT_ROW: CSSProperties = {
  display: "flex",
  gap: SPACE.md,
  marginBottom: SPACE.xxl,
};

const FIELD_STACK: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: SPACE.lg,
  marginTop: SPACE.xxl,
};

function environmentButton(selected: boolean, d: Dir): CSSProperties {
  return {
    border: `1px solid ${selected ? d.accent : d.border}`,
    borderRadius: RADIUS.md,
    background: selected ? d.accentSoft : "transparent",
    color: selected ? d.accent : d.textMid,
    fontFamily: SANS,
    fontSize: FONT.md,
    fontWeight: WEIGHT.semibold,
    padding: `${SPACE.md}px ${SPACE.xl}px`,
    cursor: "pointer",
  };
}

function inputStyle(d: Dir): CSSProperties {
  return {
    boxSizing: "border-box",
    width: "100%",
    border: `1px solid ${d.borderStrong}`,
    borderRadius: RADIUS.md,
    background: d.surface,
    color: d.text,
    fontFamily: SANS,
    fontSize: FONT.md,
    padding: `${SPACE.lg}px ${SPACE.xl}px`,
  };
}

function statusStyle(color: string): CSSProperties {
  return {
    color,
    fontFamily: SANS,
    fontSize: FONT.md,
    marginTop: SPACE.lg,
  };
}

function saveButton(d: Dir): CSSProperties {
  return {
    border: "none",
    borderRadius: RADIUS.md,
    background: d.accent,
    color: d.accentText,
    cursor: "pointer",
    fontFamily: SANS,
    fontSize: FONT.md,
    fontWeight: WEIGHT.bold,
    marginTop: SPACE.xxl,
    padding: `${SPACE.lg}px ${SPACE.xxl}px`,
  };
}

export interface DeploySectionProps {
  d: Dir;
}

export function DeploySection({ d }: DeploySectionProps) {
  const [config, setConfig] = useState<ProjectAutomationConfig | null>(null);
  const [environment, setEnvironment] = useState<Environment>("preview");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    void fetchAutomationConfig()
      .then((value) => {
        if (active) {
          setConfig(value);
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : "Could not load deployment setup");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  if (config === null) {
    return (
      <div>
        <div style={sectionTitle(d)}>Deploy Target</div>
        <div style={statusStyle(error === null ? d.textMuted : ERROR_RED)}>
          {error ?? "Loading deployment setup…"}
        </div>
      </div>
    );
  }

  const currentConfig = config;
  const target = currentConfig[environment];

  function updateTarget(update: (current: DeploymentAutomation) => DeploymentAutomation) {
    const current = currentConfig[environment];
    if (current === null) {
      return;
    }
    setSaved(false);
    setConfig({ ...currentConfig, [environment]: update(current) });
  }

  function selectTarget(id: (typeof DEPLOYMENT_OPTIONS)[number]["id"]) {
    setSaved(false);
    setConfig({
      ...currentConfig,
      [environment]: id === "disabled" ? null : deploymentPreset(id),
    });
  }

  async function save() {
    setError(null);
    setSaved(false);
    try {
      setConfig(await updateAutomationConfig(currentConfig));
      setSaved(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save deployment setup");
    }
  }

  return (
    <div>
      <div style={sectionTitle(d)}>Deploy Target</div>
      <div style={sectionSubtitle(d)}>
        Preview can run after quality passes. Production always needs separate human approval.
      </div>

      <div style={ENVIRONMENT_ROW}>
        {ENVIRONMENTS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setEnvironment(id)}
            style={environmentButton(environment === id, d)}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={OPTION_STACK}>
        {DEPLOYMENT_OPTIONS.map((option) => {
          const selected = (target?.provider ?? "disabled") === option.id;
          return (
            <button
              key={option.id}
              onClick={() => selectTarget(option.id)}
              style={optionCard(selected, d)}
            >
              <Server
                size={ICON.md}
                style={{ color: selected ? d.accent : d.textMuted, flexShrink: 0 }}
              />
              <div style={FLEX_FILL}>
                <div style={{ color: d.text, fontFamily: SANS, fontWeight: WEIGHT.semibold }}>
                  {option.label}
                </div>
                <div style={mutedCaption(d)}>{option.description}</div>
              </div>
              {selected && <Check size={ICON.md} color={d.accent} />}
            </button>
          );
        })}
      </div>

      {target !== null && (
        <div style={FIELD_STACK}>
          <label>
            <div style={fieldLabel(d)}>Executable</div>
            <input
              aria-label="Deploy executable"
              value={target.command.executable}
              onChange={(event) =>
                updateTarget((current) => ({
                  ...current,
                  command: { ...current.command, executable: event.target.value },
                }))
              }
              style={inputStyle(d)}
            />
          </label>
          <label>
            <div style={fieldLabel(d)}>Arguments — one per line</div>
            <textarea
              aria-label="Deploy arguments"
              value={argumentsText(target.command.args)}
              onChange={(event) =>
                updateTarget((current) => ({
                  ...current,
                  command: {
                    ...current.command,
                    args: argumentsFromText(event.target.value),
                  },
                }))
              }
              rows={4}
              style={inputStyle(d)}
            />
          </label>
          <label>
            <div style={fieldLabel(d)}>Working directory — project-relative</div>
            <input
              aria-label="Deploy working directory"
              placeholder="Project root"
              value={target.command.cwd ?? ""}
              onChange={(event) =>
                updateTarget((current) => ({
                  ...current,
                  command: {
                    ...current.command,
                    cwd: event.target.value.trim() === "" ? null : event.target.value,
                  },
                }))
              }
              style={inputStyle(d)}
            />
          </label>
          <label>
            <div style={fieldLabel(d)}>Deployment URL</div>
            <input
              aria-label="Deployment URL"
              placeholder="https://preview.example.com"
              value={target.url ?? ""}
              onChange={(event) =>
                updateTarget((current) => ({
                  ...current,
                  url: event.target.value.trim() === "" ? null : event.target.value,
                }))
              }
              style={inputStyle(d)}
            />
          </label>
          <label>
            <div style={fieldLabel(d)}>Health URL</div>
            <input
              aria-label="Deployment health URL"
              placeholder="https://preview.example.com/health"
              value={target.healthUrl ?? ""}
              onChange={(event) =>
                updateTarget((current) => ({
                  ...current,
                  healthUrl: event.target.value.trim() === "" ? null : event.target.value,
                }))
              }
              style={inputStyle(d)}
            />
          </label>
          <label>
            <div style={fieldLabel(d)}>Rollback notes</div>
            <textarea
              aria-label="Deployment rollback notes"
              value={target.rollbackNotes ?? ""}
              onChange={(event) =>
                updateTarget((current) => ({
                  ...current,
                  rollbackNotes:
                    event.target.value.trim() === "" ? null : event.target.value,
                }))
              }
              rows={3}
              style={inputStyle(d)}
            />
          </label>
        </div>
      )}

      <button onClick={() => void save()} style={saveButton(d)}>
        Save deployment setup
      </button>
      {saved && <div style={statusStyle(OK_GREEN)}>Deployment setup saved.</div>}
      {error !== null && <div style={statusStyle(ERROR_RED)}>{error}</div>}
    </div>
  );
}
