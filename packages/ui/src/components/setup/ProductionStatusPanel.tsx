import type { DeploymentRecord, ProductionStatus, ProductionVerificationState } from "@isotopy/core";
import { PRODUCTION_ROLLBACK_CONFIRMATION } from "@isotopy/core";
import type { Dir } from "../../theme";
import { ERROR_RED, OK_GREEN, mutedCaption } from "./setup-styles";
import { BUTTON_ROW, actionButton, blockTitle, statusStyle } from "./automation-styles";

const SHORT_REF_LENGTH = 7;

export interface ProductionStatusPanelProps {
  d: Dir;
  status: ProductionStatus;
  canRollBack: boolean;
  busy: boolean;
  onRollBack: (ref: string) => Promise<void>;
  onRefresh: () => Promise<void>;
}

function shortRef(ref: string): string {
  return ref.slice(0, SHORT_REF_LENGTH);
}

function deploymentLine(record: DeploymentRecord): string {
  const { result } = record;
  const action = result.kind === "rollback" ? "Rollback" : "Deployment";
  const outcome = result.verdict === "pass" ? "passed" : "failed";
  const ref = result.ref === undefined ? "" : ` · commit ${shortRef(result.ref)}`;
  const url = result.url === undefined ? "" : ` — ${result.url}`;
  return `${action} ${outcome}${url}${ref} · ${new Date(result.finishedAt).toLocaleString()}`;
}

function verificationLine(verification: ProductionVerificationState): string {
  const outcome = verification.verdict ?? verification.status;
  return `Production check: ${outcome} (run ${verification.runId})`;
}

function verificationColor(verification: ProductionVerificationState, d: Dir): string {
  if (verification.verdict === "PASS") return OK_GREEN;
  if (verification.verdict === "FAIL" || verification.status === "failed") return ERROR_RED;
  return d.textMuted;
}

function rollbackPrompt(ref: string): string {
  return `Redeploy commit ${shortRef(ref)} to production? This changes the live product.\nType ${PRODUCTION_ROLLBACK_CONFIRMATION} to confirm.`;
}

export function ProductionStatusPanel({
  d,
  status,
  canRollBack,
  busy,
  onRollBack,
  onRefresh,
}: ProductionStatusPanelProps) {
  const { latest, verification, rollbackRef } = status;
  if (latest === undefined) {
    return null;
  }

  async function confirmRollback(ref: string) {
    if (window.prompt(rollbackPrompt(ref)) === PRODUCTION_ROLLBACK_CONFIRMATION) {
      await onRollBack(ref);
    }
  }

  const failedCheck = verification?.verdict === "FAIL";
  return (
    <div>
      <div style={blockTitle(d)}>Production now</div>
      <div style={statusStyle(latest.result.verdict === "pass" ? OK_GREEN : ERROR_RED)}>
        {deploymentLine(latest)}
      </div>
      {verification !== undefined && (
        <div style={statusStyle(verificationColor(verification, d))}>{verificationLine(verification)}</div>
      )}
      {latest.verificationRefusal !== undefined && (
        <div style={statusStyle(ERROR_RED)}>{latest.verificationRefusal}</div>
      )}
      {failedCheck && (
        <div style={mutedCaption(d)}>
          The check after the deploy failed. Read its run, then roll back if people are affected.
        </div>
      )}
      <div style={BUTTON_ROW}>
        <button disabled={busy} onClick={() => void onRefresh()} style={actionButton(d.accent, d)}>
          Refresh status
        </button>
        {canRollBack && rollbackRef !== undefined && (
          <button
            disabled={busy}
            onClick={() => void confirmRollback(rollbackRef)}
            style={actionButton(ERROR_RED, d)}
          >
            {busy ? "Working…" : `Roll back to ${shortRef(rollbackRef)}…`}
          </button>
        )}
      </div>
    </div>
  );
}
