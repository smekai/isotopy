export type Route =
  | { kind: "home" }
  | { kind: "run"; runId: string }
  | { kind: "milestone"; milestoneId: string }
  | { kind: "schedule"; scheduleId: string };

export const HOME_ROUTE: Route = { kind: "home" };

const HOME_HASH = "#/";
const RUN_HASH = /^#\/runs\/([^/?#]+)/;
const MILESTONE_HASH = /^#\/milestones\/([^/?#]+)/;
const SCHEDULE_HASH = /^#\/schedules\/([^/?#]+)/;

export function parseRoute(hash: string): Route {
  const runId = RUN_HASH.exec(hash)?.[1];
  if (runId) {
    return { kind: "run", runId: decodeURIComponent(runId) };
  }
  const milestoneId = MILESTONE_HASH.exec(hash)?.[1];
  if (milestoneId) {
    return { kind: "milestone", milestoneId: decodeURIComponent(milestoneId) };
  }
  const scheduleId = SCHEDULE_HASH.exec(hash)?.[1];
  return scheduleId
    ? { kind: "schedule", scheduleId: decodeURIComponent(scheduleId) }
    : HOME_ROUTE;
}

export function routeHash(route: Route): string {
  switch (route.kind) {
    case "run":
      return `#/runs/${encodeURIComponent(route.runId)}`;
    case "milestone":
      return `#/milestones/${encodeURIComponent(route.milestoneId)}`;
    case "schedule":
      return `#/schedules/${encodeURIComponent(route.scheduleId)}`;
    case "home":
      return HOME_HASH;
  }
}

export function routeRunId(route: Route): string | null {
  return route.kind === "run" ? route.runId : null;
}

export function routeMilestoneId(route: Route): string | null {
  return route.kind === "milestone" ? route.milestoneId : null;
}

export function routeScheduleId(route: Route): string | null {
  return route.kind === "schedule" ? route.scheduleId : null;
}

export function runRoute(runId: string): Route {
  return { kind: "run", runId };
}

export function milestoneRoute(milestoneId: string): Route {
  return { kind: "milestone", milestoneId };
}

export function scheduleRoute(scheduleId: string): Route {
  return { kind: "schedule", scheduleId };
}
