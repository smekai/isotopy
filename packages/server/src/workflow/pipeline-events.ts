import { event } from "@aikirun/workflow";
import { LIMIT_CHOICES } from "@isotopy/core";
import { z } from "zod";

const stageId = z.string().min(1);

const gateEventSchema = z.object({ stageId }).strict();

const answerEventSchema = z.object({ stageId, text: z.string().min(1) }).strict();

const limitEventSchema = z.object({ stageId, choice: z.enum(LIMIT_CHOICES) }).strict();

export type GateEvent = z.infer<typeof gateEventSchema>;
export type AnswerEvent = z.infer<typeof answerEventSchema>;
export type LimitEvent = z.infer<typeof limitEventSchema>;

export const PIPELINE_EVENTS = {
  gate: event<GateEvent>({ schema: gateEventSchema }),
  answer: event<AnswerEvent>({ schema: answerEventSchema }),
  limit: event<LimitEvent>({ schema: limitEventSchema }),
};

export type PipelineEvents = typeof PIPELINE_EVENTS;
