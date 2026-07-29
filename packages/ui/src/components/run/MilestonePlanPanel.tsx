import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type {
  Milestone,
  MilestoneFeatureProposal,
  MilestoneProposal,
  RunState,
} from "@adhd/core";
import {
  approveMilestonePlan,
  fetchMilestone,
  reviseMilestonePlan,
  updateMilestoneProposal,
} from "../../api";
import type { SettingsController } from "../../hooks/useSettings";
import type { Dir } from "../../theme";
import { FONT, RADIUS, SANS, SPACE, WEIGHT } from "../../theme";
import { modelForEngine } from "@adhd/core";
import { SCROLL_BODY } from "./run-styles";

const MAX_WIDTH = 900;

function field(d: Dir): CSSProperties {
  return {
    width: "100%",
    boxSizing: "border-box",
    border: `1px solid ${d.border}`,
    borderRadius: RADIUS.md,
    background: d.surface,
    color: d.text,
    padding: `${SPACE.md}px ${SPACE.lg}px`,
    fontFamily: SANS,
    fontSize: FONT.md,
  };
}

function button(d: Dir, primary = false): CSSProperties {
  return {
    border: `1px solid ${primary ? d.accent : d.border}`,
    borderRadius: RADIUS.md,
    background: primary ? d.accent : d.surface2,
    color: primary ? "#fff" : d.textMid,
    padding: `${SPACE.md}px ${SPACE.xl}px`,
    fontFamily: SANS,
    fontWeight: WEIGHT.semibold,
    cursor: "pointer",
  };
}

interface Props {
  run: RunState;
  d: Dir;
  settings: SettingsController;
  onRunStarted: (runId: string) => void;
}

export function MilestonePlanPanel({
  run,
  d,
  settings,
  onRunStarted,
}: Props) {
  const [milestone, setMilestone] = useState<Milestone>();
  const [proposal, setProposal] = useState<MilestoneProposal>();
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!run.milestoneId) return;
    void fetchMilestone(run.milestoneId)
      .then((value) => {
        setMilestone(value);
        setProposal(value.proposal);
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Failed to load milestone"),
      );
  }, [run.id, run.milestoneId, run.status]);

  if (!run.milestoneId) {
    return <div style={{ padding: SPACE.x4l }}>Planning run has no milestone.</div>;
  }
  if (!proposal) {
    return (
      <div style={{ padding: SPACE.x4l, color: d.textMuted }}>
        Finish the Product Manager conversation to generate an editable proposal.
        {milestone?.approvalError && (
          <div style={{ color: "#DC2626", marginTop: SPACE.lg }}>
            {milestone.approvalError}
          </div>
        )}
      </div>
    );
  }

  const updateFeature = (
    featureId: string,
    change: (feature: MilestoneFeatureProposal) => MilestoneFeatureProposal,
  ) => {
    setProposal((current) =>
      current
        ? {
            ...current,
            features: current.features.map((feature) =>
              feature.id === featureId ? change(feature) : feature,
            ),
          }
        : current,
    );
  };

  const save = async (): Promise<Milestone> => {
    const saved = await updateMilestoneProposal(run.milestoneId!, {
      name: proposal.name,
      goal: proposal.goal,
      features: proposal.features,
    });
    setMilestone(saved);
    setProposal(saved.proposal);
    return saved;
  };

  const act = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError(undefined);
    try {
      await operation();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Milestone operation failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={SCROLL_BODY}>
      <div
        style={{
          maxWidth: MAX_WIDTH,
          margin: "0 auto",
          padding: SPACE.x4l,
          display: "grid",
          gap: SPACE.xl,
        }}
        data-testid="milestone-plan-editor"
      >
        <div>
          <h2 style={{ color: d.text, margin: 0 }}>Review milestone proposal</h2>
          <div style={{ color: d.textMuted, marginTop: SPACE.sm }}>
            Revision {proposal.revision}. No tasks are created until approval.
          </div>
        </div>
        <input
          aria-label="Milestone name"
          value={proposal.name}
          onChange={(event) =>
            setProposal({ ...proposal, name: event.target.value })
          }
          style={field(d)}
        />
        <textarea
          aria-label="Milestone goal"
          value={proposal.goal}
          onChange={(event) =>
            setProposal({ ...proposal, goal: event.target.value })
          }
          rows={3}
          style={field(d)}
        />
        {proposal.features.map((feature, featureIndex) => (
          <section
            key={feature.id}
            style={{
              border: `1px solid ${d.border}`,
              borderRadius: RADIUS.lg,
              padding: SPACE.xl,
              display: "grid",
              gap: SPACE.md,
              background: d.surface2,
            }}
          >
            <strong style={{ color: d.text }}>Feature {featureIndex + 1}</strong>
            <input
              aria-label={`Feature ${featureIndex + 1} title`}
              value={feature.title}
              onChange={(event) =>
                updateFeature(feature.id, (current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
              style={field(d)}
            />
            <textarea
              aria-label={`Feature ${featureIndex + 1} description`}
              value={feature.description}
              onChange={(event) =>
                updateFeature(feature.id, (current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              rows={2}
              style={field(d)}
            />
            <textarea
              aria-label={`Feature ${featureIndex + 1} acceptance criteria`}
              value={feature.acceptanceCriteria.join("\n")}
              onChange={(event) =>
                updateFeature(feature.id, (current) => ({
                  ...current,
                  acceptanceCriteria: event.target.value
                    .split(/\r?\n/)
                    .map((value) => value.trim())
                    .filter(Boolean),
                }))
              }
              rows={3}
              style={field(d)}
            />
            <input
              aria-label={`Feature ${featureIndex + 1} existing tasks`}
              value={feature.existingTaskIds.join(", ")}
              onChange={(event) =>
                updateFeature(feature.id, (current) => ({
                  ...current,
                  existingTaskIds: event.target.value
                    .split(",")
                    .map((value) => value.trim())
                    .filter(Boolean),
                }))
              }
              placeholder="Existing task IDs"
              style={field(d)}
            />
            {feature.taskDrafts.map((task, taskIndex) => (
              <div
                key={task.id}
                style={{ display: "grid", gap: SPACE.sm, paddingLeft: SPACE.lg }}
              >
                <strong style={{ color: d.textMid, fontSize: FONT.sm }}>
                  New task {taskIndex + 1}
                </strong>
                <input
                  aria-label={`Task ${taskIndex + 1} title`}
                  value={task.title}
                  onChange={(event) =>
                    updateFeature(feature.id, (current) => ({
                      ...current,
                      taskDrafts: current.taskDrafts.map((entry) =>
                        entry.id === task.id
                          ? { ...entry, title: event.target.value }
                          : entry,
                      ),
                    }))
                  }
                  style={field(d)}
                />
                <textarea
                  aria-label={`Task ${taskIndex + 1} description`}
                  value={task.description}
                  onChange={(event) =>
                    updateFeature(feature.id, (current) => ({
                      ...current,
                      taskDrafts: current.taskDrafts.map((entry) =>
                        entry.id === task.id
                          ? { ...entry, description: event.target.value }
                          : entry,
                      ),
                    }))
                  }
                  rows={3}
                  style={field(d)}
                />
              </div>
            ))}
          </section>
        ))}
        {error && <div style={{ color: "#DC2626" }}>{error}</div>}
        <div style={{ display: "flex", gap: SPACE.md }}>
          <button
            disabled={busy}
            onClick={() => void act(async () => void (await save()))}
            style={button(d)}
          >
            Save edits
          </button>
          <button
            data-testid="approve-milestone-plan"
            disabled={busy}
            onClick={() =>
              void act(async () => {
                await save();
                const approved = await approveMilestonePlan(run.milestoneId!);
                setMilestone(approved);
              })
            }
            style={button(d, true)}
          >
            {milestone?.status === "active" ? "Milestone approved" : "Approve milestone"}
          </button>
        </div>
        {milestone?.status === "draft" && (
          <div style={{ display: "grid", gap: SPACE.md }}>
            <textarea
              aria-label="Revision request"
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
              placeholder="Ask the Product Manager to revise the proposal"
              rows={2}
              style={field(d)}
            />
            <button
              disabled={busy || !feedback.trim()}
              onClick={() =>
                void act(async () => {
                  const engine = settings.preferences.engine;
                  const revision = await reviseMilestonePlan(run.milestoneId!, {
                    feedback: feedback.trim(),
                    engine,
                    model: modelForEngine(settings.preferences, engine),
                    permissionMode: settings.preferences.permissionMode,
                  });
                  onRunStarted(revision.id);
                })
              }
              style={button(d)}
            >
              Request AI revision
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
