import { Hono } from "hono";
import type { Context } from "hono";
import type { ScheduleView } from "@isotopy/core";
import { invalidRequest } from "../domain/validation.ts";
import { createScheduleSchema, updateScheduleSchema } from "../schemas/schedule.ts";
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
  return new Hono()
    .get("/", (c) => c.json(schedules.listSchedules(projectScope(registry, c).id)))
    .get("/:scheduleId", (c) => {
      const schedule = schedules.getSchedule(c.req.param("scheduleId"));
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
      return parsed.ok
        ? saved(c, () => schedules.updateSchedule(c.req.param("scheduleId"), parsed.value))
        : c.json(invalidRequest(parsed.issues), 400);
    })
    .delete("/:scheduleId", async (c) => {
      try {
        await schedules.deleteSchedule(c.req.param("scheduleId"));
        return c.json({ ok: true });
      } catch (error) {
        return c.json({ error: messageOf(error) }, 404);
      }
    });
}
