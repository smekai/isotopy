import type { CSSProperties, ReactNode } from "react";
import type {
  CloseoutFinding,
  CreatedTaskReference,
  RunArtifacts,
  RunCloseoutRecord,
} from "@isotopy/core";
import type { Dir } from "../../theme";
import { FONT, MONO, RADIUS, SANS, SPACE, WEIGHT, WARN_AMBER } from "../../theme";
import { FAIL_RED, SCROLL_BODY } from "./run-styles";

const CONTENT_MAX_WIDTH = 820;

const BACKEND_LABEL: Record<CreatedTaskReference["backend"], string> = {
  taskplanner: "TaskPlanner",
  isotopy: "Isotopy",
};

const CONTENT: CSSProperties = {
  maxWidth: CONTENT_MAX_WIDTH,
  margin: "0 auto",
  padding: SPACE.x4l,
  display: "flex",
  flexDirection: "column",
  gap: SPACE.xxl,
};

function summaryText(d: Dir): CSSProperties {
  return {
    color: d.text,
    fontFamily: SANS,
    fontSize: FONT.lg,
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
  };
}

function sectionHeading(d: Dir): CSSProperties {
  return {
    color: d.textMuted,
    fontFamily: SANS,
    fontSize: FONT.xs,
    fontWeight: WEIGHT.bold,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    marginBottom: SPACE.md,
  };
}

function bulletList(d: Dir): CSSProperties {
  return {
    margin: 0,
    paddingLeft: SPACE.xxl,
    color: d.textMid,
    fontFamily: SANS,
    fontSize: FONT.md,
    lineHeight: 1.7,
  };
}

const CHIP_ROW: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: SPACE.sm,
};

function taskChip(d: Dir): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: SPACE.sm,
    border: `1px solid ${d.border}`,
    borderRadius: RADIUS.md,
    background: d.surface2,
    padding: `${SPACE.xs}px ${SPACE.md}px`,
    color: d.textMid,
    fontFamily: SANS,
    fontSize: FONT.sm,
  };
}

function taskId(d: Dir): CSSProperties {
  return { color: d.accent, fontFamily: MONO, fontSize: FONT.xxs, fontWeight: WEIGHT.bold };
}

function backendBadge(d: Dir): CSSProperties {
  return { color: d.textMuted, fontFamily: MONO, fontSize: FONT.xxs };
}

function idChip(d: Dir): CSSProperties {
  return {
    border: `1px solid ${d.border}`,
    borderRadius: RADIUS.md,
    background: d.surface2,
    padding: `${SPACE.xxs}px ${SPACE.md}px`,
    color: d.textMid,
    fontFamily: MONO,
    fontSize: FONT.xxs,
  };
}

function findingRow(blocking: boolean, d: Dir): CSSProperties {
  return {
    borderLeft: `3px solid ${blocking ? FAIL_RED : WARN_AMBER}`,
    paddingLeft: SPACE.lg,
    color: d.textMid,
    fontFamily: SANS,
    fontSize: FONT.md,
  };
}

function findingSeverity(blocking: boolean): CSSProperties {
  return {
    color: blocking ? FAIL_RED : WARN_AMBER,
    fontFamily: MONO,
    fontSize: FONT.xxs,
    fontWeight: WEIGHT.bold,
    letterSpacing: "0.06em",
  };
}

function evidenceText(d: Dir): CSSProperties {
  return { color: d.textMuted, fontFamily: SANS, fontSize: FONT.sm };
}

const PLAIN_LIST: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: SPACE.md,
};

const WARNING_BOX: CSSProperties = {
  border: "1px solid rgba(220,38,38,0.35)",
  borderRadius: RADIUS.md,
  background: "rgba(220,38,38,0.06)",
  padding: SPACE.xl,
  color: FAIL_RED,
  fontFamily: SANS,
  fontSize: FONT.md,
};

const BLOCKING_TEXT: CSSProperties = { color: FAIL_RED };
const REJECTED_TEXT: CSSProperties = { color: WARN_AMBER };

function cleanupLine(d: Dir): CSSProperties {
  return { color: d.textMid, fontFamily: MONO, fontSize: FONT.xs, lineHeight: 1.8 };
}

interface SectionProps {
  heading: string;
  d: Dir;
  children: ReactNode;
}

function Section({ heading, d, children }: SectionProps) {
  return (
    <section>
      <div style={sectionHeading(d)}>{heading}</div>
      {children}
    </section>
  );
}

interface BulletsProps {
  heading: string;
  items: string[];
  d: Dir;
}

function Bullets({ heading, items, d }: BulletsProps) {
  if (items.length === 0) {
    return null;
  }
  return (
    <Section heading={heading} d={d}>
      <ul style={bulletList(d)}>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </Section>
  );
}

interface IdChipsProps {
  heading: string;
  ids: string[];
  d: Dir;
}

function IdChips({ heading, ids, d }: IdChipsProps) {
  if (ids.length === 0) {
    return null;
  }
  return (
    <Section heading={heading} d={d}>
      <div style={CHIP_ROW}>
        {ids.map((id) => (
          <span key={id} style={idChip(d)}>
            {id}
          </span>
        ))}
      </div>
    </Section>
  );
}

interface FindingItemProps {
  finding: CloseoutFinding;
  d: Dir;
}

function FindingItem({ finding, d }: FindingItemProps) {
  const blocking = finding.severity === "blocking";
  return (
    <li style={findingRow(blocking, d)}>
      <span style={findingSeverity(blocking)}>
        {blocking ? "BLOCKING" : "NON-BLOCKING"}
      </span>{" "}
      {finding.title}
      {finding.evidence && <div style={evidenceText(d)}>{finding.evidence}</div>}
    </li>
  );
}

interface ArtifactReportProps {
  report: RunArtifacts;
  validationErrors: string[];
  testId: string;
  d: Dir;
  children?: ReactNode;
}

function ArtifactReport({
  report,
  validationErrors,
  testId,
  d,
  children,
}: ArtifactReportProps) {
  return (
    <div style={SCROLL_BODY}>
      <div style={CONTENT} data-testid={testId}>
        <div style={summaryText(d)}>{report.summary}</div>

        {validationErrors.length > 0 && (
          <div style={WARNING_BOX} data-testid="closeout-validation-errors">
            <ul style={bulletList(d)}>
              {validationErrors.map((error) => (
                <li key={error} style={BLOCKING_TEXT}>
                  {error}
                </li>
              ))}
            </ul>
          </div>
        )}

        <Bullets heading="Delivered scope" items={report.deliveredScope} d={d} />
        <Bullets heading="Decisions" items={report.decisions} d={d} />
        <Bullets heading="Knowledge" items={report.knowledge} d={d} />

        {report.findings.length > 0 && (
          <Section heading="Findings" d={d}>
            <ul style={PLAIN_LIST}>
              {report.findings.map((finding) => (
                <FindingItem key={finding.id} finding={finding} d={d} />
              ))}
            </ul>
          </Section>
        )}

        {children}

        {report.nextRecommendation && (
          <Section heading="Next recommendation" d={d}>
            <div style={summaryText(d)}>{report.nextRecommendation}</div>
          </Section>
        )}
      </div>
    </div>
  );
}

export interface CloseoutPanelProps {
  closeout: RunCloseoutRecord;
  d: Dir;
}

export function CloseoutPanel({ closeout, d }: CloseoutPanelProps) {
  const { report, createdTasks, cleanup, validationErrors } = closeout;

  return (
    <ArtifactReport
      report={report}
      validationErrors={validationErrors}
      testId="closeout-panel"
      d={d}
    >
      {createdTasks.length > 0 && (
        <Section heading="Created tasks" d={d}>
          <div style={CHIP_ROW}>
            {createdTasks.map((task) => (
              <span key={task.id} style={taskChip(d)} data-testid="closeout-created-task">
                <span style={taskId(d)}>{task.id}</span>
                {task.title}
                <span style={backendBadge(d)}>{BACKEND_LABEL[task.backend]}</span>
              </span>
            ))}
          </div>
        </Section>
      )}

      <IdChips heading="Completed source tasks" ids={report.completedTaskIds} d={d} />
      <IdChips heading="Unresolved source tasks" ids={report.unresolvedTaskIds} d={d} />

      {(cleanup.removed.length > 0 || cleanup.rejected.length > 0) && (
        <Section heading="Cleanup" d={d}>
          <div style={cleanupLine(d)}>
            {cleanup.removed.map((entry) => (
              <div key={entry}>Removed {entry}</div>
            ))}
            {cleanup.rejected.map((entry) => (
              <div key={entry} style={REJECTED_TEXT}>
                Rejected {entry}
              </div>
            ))}
          </div>
        </Section>
      )}
    </ArtifactReport>
  );
}
