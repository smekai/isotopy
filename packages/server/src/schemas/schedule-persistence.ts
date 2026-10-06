import { scheduleSchema } from "@isotopy/core";
import { z } from "zod";

export const persistedScheduleSchema = scheduleSchema
  .extend({ lastWindowAt: z.string().optional() })
  .strict()
  .transform(({ lastWindowAt: _retired, ...schedule }) => schedule);
