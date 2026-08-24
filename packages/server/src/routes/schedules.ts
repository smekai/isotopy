import { Hono } from "hono";
import type { Context } from "hono";
import type { ScheduleView } from "@isotopy/core";
import { createScheduleSchema, updateScheduleSchema } from "@isotopy/core";
import { invalidRequest } from "../domain/validation.ts";
import { ScheduleInvalidError } from "../services/schedule-service.ts";
import type { ScheduleService } from "../services/schedule-service.ts";
import type { ProjectRegistry } from "../services/project-registry.ts";
import { messageOf } from "../utils/message-of.ts";
import { projectScope } from "./project-scope.ts";
import { parseRequestBody } from "./request-body.ts";

async function saved(c: Context, save: () => Promise<ScheduleView>): Promise<Response> {
  try {
    return c.json(await save());
  } catch (error) {
    return error instanceof ScheduleInvalidError
      ? c.json(invalidRequest(error.issues), 400)
      : c.json({ error: messageOf(error) }, 400);
  }
}

export function createScheduleRoutes(
  schedules: ScheduleService,
  registry: ProjectRegistry,
): Hono {
  const scopeOf = (c: Context) => projectScope(registry, c).id;

  return new Hono()
    .get("/", (c) => c.json(schedules.listSchedules(scopeOf(c))))
    .get("/:scheduleId", (c) => {
      const schedule = schedules.getSchedule(c.req.param("scheduleId"), scopeOf(c));
      return schedule ? c.json(schedule) : c.json({ error: "Unknown schedule" }, 404);
    })
    .post("/", async (c) => {
      const parsed = await parseRequestBody(c.req, createScheduleSchema);
      return parsed.ok
        ? saved(c, () => schedules.createSchedule(projectScope(registry, c), parsed.value))
        : c.json(invalidRequest(parsed.issues), 400);
    })
    .patch("/:scheduleId", async (c) => {
      const parsed = await parseRequestBody(c.req, updateScheduleSchema);
      if (!parsed.ok) {
        return c.json(invalidRequest(parsed.issues), 400);
      }
      if (!schedules.getSchedule(c.req.param("scheduleId"), scopeOf(c))) {
        return c.json({ error: "Unknown schedule" }, 404);
      }
      return saved(c, () =>
        schedules.updateSchedule(c.req.param("scheduleId"), parsed.value, scopeOf(c)),
      );
    })
    .delete("/:scheduleId", async (c) => {
      if (!schedules.getSchedule(c.req.param("scheduleId"), scopeOf(c))) {
        return c.json({ error: "Unknown schedule" }, 404);
      }
      await schedules.deleteSchedule(c.req.param("scheduleId"), scopeOf(c));
      return c.json({ ok: true });
    });
}
