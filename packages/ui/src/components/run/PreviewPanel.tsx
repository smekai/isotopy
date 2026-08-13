import type { CSSProperties } from "react";
import { ExternalLink, Play, RotateCw, Square } from "lucide-react";
import { isProductEmbeddable } from "@isotopy/core";
import type { ProductProcessStatus } from "@isotopy/core";
import type { ProductController } from "../../hooks/useProduct";
import type { Dir } from "../../theme";
import { FONT, ICON, RADIUS, SANS, SPACE, WEIGHT } from "../../theme";
import { FAIL_RED, PANEL, emptyNote } from "./run-styles";

const FRAME: CSSProperties = { flex: 1, minHeight: 0, border: "none", width: "100%" };

const CARD_BODY: CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: SPACE.lg,
  padding: SPACE.xxl,
  overflowY: "auto",
};

function bar(d: Dir): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: SPACE.md,
    padding: `${SPACE.md}px ${SPACE.xxl}px`,
    borderBottom: `1px solid ${d.border}`,
    background: d.surface,
    flexShrink: 0,
  };
}

function actionButton(d: Dir, disabled: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: SPACE.sm,
    border: `1px solid ${d.border}`,
    borderRadius: RADIUS.md,
    padding: `${SPACE.xs}px ${SPACE.xl}px`,
    background: "transparent",
    color: disabled ? d.textMuted : d.accent,
    cursor: disabled ? "default" : "pointer",
    fontFamily: SANS,
    fontSize: FONT.sm,
    fontWeight: WEIGHT.medium,
    whiteSpace: "nowrap",
  };
}

function addressText(d: Dir): CSSProperties {
  return {
    marginLeft: "auto",
    color: d.textMuted,
    fontFamily: SANS,
    fontSize: FONT.xs,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };
}

function headingText(d: Dir): CSSProperties {
  return { color: d.text, fontFamily: SANS, fontSize: FONT.lg, fontWeight: WEIGHT.bold };
}

function bodyText(d: Dir): CSSProperties {
  return { color: d.textMid, fontFamily: SANS, fontSize: FONT.md, lineHeight: 1.6 };
}

function reasonText(d: Dir): CSSProperties {
  return {
    color: d.textMid,
    fontFamily: SANS,
    fontSize: FONT.sm,
    background: d.surface2,
    border: `1px solid ${d.border}`,
    borderRadius: RADIUS.md,
    padding: `${SPACE.md}px ${SPACE.lg}px`,
    wordBreak: "break-word",
  };
}

function failureText(): CSSProperties {
  return { color: FAIL_RED, fontFamily: SANS, fontSize: FONT.sm, wordBreak: "break-word" };
}

function externalLink(d: Dir): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: SPACE.sm,
    color: d.accent,
    fontFamily: SANS,
    fontSize: FONT.sm,
    fontWeight: WEIGHT.medium,
    textDecoration: "none",
  };
}

function headline(status: ProductProcessStatus): string {
  switch (status.state) {
    case "starting":
      return "Starting the product…";
    case "ready":
      return "The product is running";
    case "failed":
      return "The product did not come up";
    case "exited":
      return "The product stopped";
    case "stopped":
      return "The product is not running";
  }
}

function explanation(status: ProductProcessStatus): string {
  if (status.state === "starting") {
    return `Waiting for ${status.url ?? "the health URL"} to answer.`;
  }
  if (status.state === "stopped") {
    return "Start it to see what this run built, without leaving Isotopy.";
  }
  return "";
}

export interface PreviewPanelProps extends ProductController {
  d: Dir;
}

export function PreviewPanel({ status, error, busy, start, stop, restart, d }: PreviewPanelProps) {
  if (status === null) {
    return <div style={PANEL}><div style={emptyNote(d)}>Loading the product status…</div></div>;
  }

  const running = status.state === "starting" || status.state === "ready";
  const embeddable = isProductEmbeddable(status);

  return (
    <div style={PANEL} data-testid="product-preview">
      <div style={bar(d)}>
        {running ? (
          <button
            type="button"
            onClick={() => void stop()}
            disabled={busy}
            data-testid="product-stop"
            style={actionButton(d, busy)}
          >
            <Square size={ICON.sm} />
            Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void start()}
            disabled={busy}
            data-testid="product-start"
            style={actionButton(d, busy)}
          >
            <Play size={ICON.sm} />
            Start the product
          </button>
        )}
        {status.state === "ready" && (
          <button
            type="button"
            onClick={() => void restart()}
            disabled={busy}
            data-testid="product-restart"
            style={actionButton(d, busy)}
          >
            <RotateCw size={ICON.sm} />
            Restart
          </button>
        )}
        {error !== null && <span style={failureText()}>{error}</span>}
        {status.url !== undefined && <span style={addressText(d)}>{status.url}</span>}
      </div>

      {embeddable && status.url !== undefined ? (
        <iframe src={status.url} title="The running product" style={FRAME} />
      ) : (
        <div style={CARD_BODY}>
          <div style={headingText(d)}>{headline(status)}</div>
          {explanation(status) !== "" && <div style={bodyText(d)}>{explanation(status)}</div>}
          {status.framing?.allowed === false && (
            <>
              <div style={bodyText(d)}>
                It is running, but it refuses to be shown inside another page:
              </div>
              <div style={reasonText(d)}>{status.framing.blockedBy}</div>
            </>
          )}
          {status.lastError !== undefined && <div style={failureText()}>{status.lastError}</div>}
          {status.url !== undefined && status.state === "ready" && (
            <a
              href={status.url}
              target="_blank"
              rel="noreferrer"
              data-testid="product-open-external"
              style={externalLink(d)}
            >
              Open in browser
              <ExternalLink size={ICON.sm} />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
