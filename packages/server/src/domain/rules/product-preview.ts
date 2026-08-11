import type { ProductFraming } from "@adhd/core";

const MIN_POLL_INTERVAL_MS = 250;
const MAX_POLL_INTERVAL_MS = 2000;
const POLL_ATTEMPTS = 20;

export interface ProductResponseHeaders {
  xFrameOptions?: string;
  contentSecurityPolicy?: string;
}

export function readyPollIntervalMs(readyTimeoutMs: number): number {
  const spread = Math.round(readyTimeoutMs / POLL_ATTEMPTS);
  return Math.min(MAX_POLL_INTERVAL_MS, Math.max(MIN_POLL_INTERVAL_MS, spread));
}

function frameAncestors(contentSecurityPolicy: string): string | undefined {
  for (const directive of contentSecurityPolicy.split(";")) {
    const trimmed = directive.trim();
    if (/^frame-ancestors(\s|$)/i.test(trimmed)) {
      return trimmed;
    }
  }
  return undefined;
}

function frameOptionsBlock(xFrameOptions: string): string | undefined {
  const value = xFrameOptions.trim();
  return /^(deny|sameorigin)$/i.test(value) ? `X-Frame-Options: ${value}` : undefined;
}

function frameAncestorsBlock(contentSecurityPolicy: string): string | undefined {
  const directive = frameAncestors(contentSecurityPolicy);
  if (directive === undefined) {
    return undefined;
  }
  const sources = directive.slice("frame-ancestors".length).trim();
  return sources === "*" ? undefined : `Content-Security-Policy: ${directive}`;
}

export function framingVerdict(headers: ProductResponseHeaders): ProductFraming {
  const blockedBy =
    (headers.xFrameOptions === undefined ? undefined : frameOptionsBlock(headers.xFrameOptions)) ??
    (headers.contentSecurityPolicy === undefined
      ? undefined
      : frameAncestorsBlock(headers.contentSecurityPolicy));
  return blockedBy === undefined ? { allowed: true } : { allowed: false, blockedBy };
}
