import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { EngineId, EngineModelList } from "@adhd/core";
import { modelOptionsFor } from "@adhd/core";
import { fetchEngineModels } from "../../api";
import { FONT, GOLD, MONO, RADIUS, SANS, SPACE } from "../../theme";
import type { Dir } from "../../theme";
import { WHITE, fieldLabel, mutedCaption } from "./setup-styles";

const MODEL_SOURCE_LABEL: Record<EngineModelList["source"], string> = {
  cli: "from the CLI",
  config: "from the CLI's config",
  static: "built-in list",
};

function seedModelList(engineId: EngineId): EngineModelList {
  return { options: modelOptionsFor(engineId), source: "static" };
}

function modelSelect(d: Dir): CSSProperties {
  return {
    width: "100%",
    border: `1px solid ${d.border}`,
    borderRadius: RADIUS.lg,
    padding: `${SPACE.lg}px ${SPACE.xl}px`,
    fontFamily: MONO,
    fontSize: FONT.md,
    color: d.text,
    background: WHITE,
    outline: "none",
    marginBottom: SPACE.sm,
  };
}

function modelMetaRow(followedByNote: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "baseline",
    gap: SPACE.sm,
    marginBottom: followedByNote ? 6 : 20,
  };
}

function customIdToggle(d: Dir): CSSProperties {
  return {
    border: "none",
    background: "transparent",
    padding: 0,
    color: d.accent,
    fontFamily: SANS,
    fontSize: FONT.sm,
    cursor: "pointer",
    marginLeft: "auto",
    flexShrink: 0,
  };
}

function customModelInput(followedByNote: boolean, d: Dir): CSSProperties {
  return {
    width: "100%",
    border: `1px solid ${d.border}`,
    borderRadius: RADIUS.lg,
    padding: `${SPACE.lg}px ${SPACE.xl}px`,
    fontFamily: MONO,
    fontSize: FONT.md,
    color: d.text,
    background: d.surface2,
    outline: "none",
    marginBottom: followedByNote ? 6 : 20,
  };
}

const CREDITS_NOTE: CSSProperties = {
  color: GOLD,
  fontFamily: SANS,
  fontSize: FONT.sm,
  marginBottom: SPACE.xxxl,
};

export interface EngineModelPickerProps {
  d: Dir;
  engine: EngineId;
  model: string;
  refreshKey: number;
  onSelect: (modelId: string) => void;
}

export function EngineModelPicker({ d, engine, model, refreshKey, onSelect }: EngineModelPickerProps) {
  const [modelList, setModelList] = useState<EngineModelList>(() => seedModelList(engine));
  const [customModel, setCustomModel] = useState(false);
  const [customModelDraft, setCustomModelDraft] = useState(model);

  useEffect(() => {
    let stale = false;
    setModelList(seedModelList(engine));
    fetchEngineModels(engine)
      .then((list) => {
        if (!stale && list.options.length > 0) setModelList(list);
      })
      .catch(() => {
      });
    return () => {
      stale = true;
    };
  }, [engine, refreshKey]);

  useEffect(() => {
    setCustomModelDraft(model);
  }, [model]);

  const modelOptions = modelList.options;
  const modelOption = modelOptions.find((opt) => opt.id === model);
  const creditsNoteShown = Boolean(modelOption?.requiresUsageCredits);

  return (
    <>
      <div style={fieldLabel(d)}>Model</div>
      <select value={model}
        onChange={(e) => onSelect(e.target.value)}
        style={modelSelect(d)}>
        {modelOptions.map((opt) => (
          <option key={opt.id} value={opt.id}>{opt.hint ? `${opt.label} — ${opt.hint}` : opt.label}</option>
        ))}
        {!modelOption && <option value={model}>{model} (custom)</option>}
      </select>
      <div style={modelMetaRow(creditsNoteShown || customModel)}>
        <span style={mutedCaption(d)}>
          {MODEL_SOURCE_LABEL[modelList.source]}{modelList.note ? ` · ${modelList.note}` : ""}
        </span>
        <button onClick={() => setCustomModel((on) => !on)} style={customIdToggle(d)}>
          {customModel ? "Hide custom ID" : "Custom ID…"}
        </button>
      </div>
      {customModel && (
        <input value={customModelDraft}
          onChange={(e) => setCustomModelDraft(e.target.value)}
          onBlur={() => onSelect(customModelDraft)}
          onKeyDown={(e) => e.key === "Enter" && onSelect(customModelDraft)}
          placeholder="Exact model ID passed to the CLI (blank = Auto)"
          style={customModelInput(creditsNoteShown, d)} />
      )}
      {creditsNoteShown && (
        <div style={CREDITS_NOTE}>
          1M context requires usage credits on your Claude plan (claude.ai/settings/usage) or an API key connection.
        </div>
      )}
    </>
  );
}
