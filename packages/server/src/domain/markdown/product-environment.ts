import { PROJECT_HEADER } from "@isotopy/core";

export interface ProductEnvironmentInput {
  apiBaseUrl: string;
  projectId: string;
  runningUrl?: string;
}

export function buildProductEnvironment({
  apiBaseUrl,
  projectId,
  runningUrl,
}: ProductEnvironmentInput): string {
  return [
    "Isotopy owns this project's product process. Do not start, stop or kill it yourself,",
    "and do not choose a port — ask Isotopy instead.",
    "",
    `Its API is at ${apiBaseUrl}, and every call needs the header \`${PROJECT_HEADER}: ${projectId}\`.`,
    "",
    "- `POST /automation/product/start` — starts the product, or returns the one already",
    "  running. Safe to call more than once.",
    "- `GET /automation/product` — the current state.",
    "",
    'Both answer with JSON: `state` is one of "starting", "ready", "failed" or "exited",',
    "`url` is where the product is served, and `lastError` explains a failure. Poll the",
    'status until `state` is "ready", then open `url`.',
    "",
    runningUrl === undefined
      ? "The product is not running yet."
      : `The product is already running at ${runningUrl}.`,
    "",
    "Drive it with your own browser capability if you have one. Where you have none,",
    "Playwright is the complete fallback and stays the authority for anything that must",
    "run in CI.",
  ].join("\n");
}
