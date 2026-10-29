import type { CSSProperties } from "react";
import type { CiResult, RunPullRequest } from "@isotopy/core";
import type { Dir } from "../../theme";
import { FONT, MONO, SANS, SPACE, WEIGHT } from "../../theme";
import { FAIL_RED, PASS_GREEN, SCROLL_BODY, SKIP_AMBER } from "./run-styles";

const CONTENT: CSSProperties = {
  maxWidth: 820,
  margin: "0 auto",
  padding: SPACE.x4l,
  display: "grid",
  gridTemplateColumns: "max-content 1fr",
  columnGap: SPACE.xxl,
  rowGap: SPACE.lg,
  alignItems: "baseline",
};

function label(d: Dir): CSSProperties {
  return {
    color: d.textMuted,
    fontFamily: SANS,
    fontSize: FONT.xs,
    fontWeight: WEIGHT.bold,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  };
}

function value(d: Dir): CSSProperties {
  return { color: d.text, fontFamily: SANS, fontSize: FONT.md, wordBreak: "break-all" };
}

function mono(d: Dir): CSSProperties {
  return { ...value(d), fontFamily: MONO };
}

const CI_LABEL: Record<CiResult, string> = {
  passed: "Passed",
  failed: "Failed",
  timed_out: "Still running when the wait ran out",
};

const CI_COLOR: Record<CiResult, string> = {
  passed: PASS_GREEN,
  failed: FAIL_RED,
  timed_out: SKIP_AMBER,
};

function ciText(ci: CiResult): CSSProperties {
  return { color: CI_COLOR[ci], fontFamily: SANS, fontSize: FONT.md, fontWeight: WEIGHT.bold };
}

export interface PullRequestPanelProps {
  pullRequest: RunPullRequest;
  d: Dir;
}

export function PullRequestPanel({ pullRequest, d }: PullRequestPanelProps) {
  return (
    <div style={SCROLL_BODY}>
      <div style={CONTENT} data-testid="pull-request">
        <span style={label(d)}>Pull request</span>
        <a href={pullRequest.url} target="_blank" rel="noreferrer" style={value(d)}>
          {pullRequest.url}
        </a>

        <span style={label(d)}>CI</span>
        {pullRequest.ci === undefined ? (
          <span style={value(d)}>Waiting for checks</span>
        ) : (
          <span style={ciText(pullRequest.ci)} data-testid="pull-request-ci">
            {CI_LABEL[pullRequest.ci]}
            {pullRequest.failingChecks && ` — ${pullRequest.failingChecks.join(", ")}`}
          </span>
        )}

        {pullRequest.previewUrl && (
          <>
            <span style={label(d)}>Preview</span>
            <a href={pullRequest.previewUrl} target="_blank" rel="noreferrer" style={value(d)}>
              {pullRequest.previewUrl}
            </a>
          </>
        )}

        {pullRequest.mergeCommit && (
          <>
            <span style={label(d)}>Merge commit</span>
            <span style={mono(d)} data-testid="pull-request-merge-commit">
              {pullRequest.mergeCommit}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
