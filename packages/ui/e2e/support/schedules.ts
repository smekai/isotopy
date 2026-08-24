import type { Page, Request } from "@playwright/test";
import type { ScheduleView } from "@isotopy/core";

const SCHEDULES_PATH = "/schedules";

export async function anticipateSchedules(
  page: Page,
  schedules: ScheduleView[],
): Promise<void> {
  await page.route(
    (url) => url.pathname === SCHEDULES_PATH,
    (route) => route.fulfill({ json: schedules }),
  );
}

/**
 * Lists still answer with the seeded schedules; a POST is recorded and answered
 * with `created`. One route has to serve both because Playwright matches on the
 * URL, and the method is only knowable inside the handler.
 */
export async function recordScheduleCreates(
  page: Page,
  seeded: ScheduleView[],
  created: ScheduleView,
): Promise<Request[]> {
  const posted: Request[] = [];
  await page.route(
    (url) => url.pathname === SCHEDULES_PATH,
    (route) => {
      if (route.request().method() !== "POST") {
        return route.fulfill({ json: seeded });
      }
      posted.push(route.request());
      return route.fulfill({ json: created });
    },
  );
  return posted;
}
