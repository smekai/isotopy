export type Route = { kind: "home" } | { kind: "run"; runId: string };

export const HOME_ROUTE: Route = { kind: "home" };

const HOME_HASH = "#/";
const RUN_HASH = /^#\/runs\/([^/?#]+)/;

export function parseRoute(hash: string): Route {
  const match = RUN_HASH.exec(hash);
  const runId = match?.[1];
  return runId ? { kind: "run", runId: decodeURIComponent(runId) } : HOME_ROUTE;
}

export function routeHash(route: Route): string {
  return route.kind === "run" ? `#/runs/${encodeURIComponent(route.runId)}` : HOME_HASH;
}

export function routeRunId(route: Route): string | null {
  return route.kind === "run" ? route.runId : null;
}

export function runRoute(runId: string): Route {
  return { kind: "run", runId };
}
