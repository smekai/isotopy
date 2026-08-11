export const PRODUCT_PROCESS_STATES = [
  "stopped",
  "starting",
  "ready",
  "failed",
  "exited",
] as const;

export type ProductProcessState = (typeof PRODUCT_PROCESS_STATES)[number];

export interface ProductFraming {
  allowed: boolean;
  blockedBy?: string;
}

export interface ProductProcessStatus {
  state: ProductProcessState;
  configured: boolean;
  projectId?: string;
  url?: string;
  framing?: ProductFraming;
  startedAt?: string;
  readyAt?: string;
  lastError?: string;
}

export function isProductLive(state: ProductProcessState): boolean {
  return state === "starting" || state === "ready";
}

export function isProductEmbeddable(status: ProductProcessStatus): boolean {
  return status.state === "ready" && status.framing?.allowed !== false;
}
