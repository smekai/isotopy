import {
  TASK_PRIORITIES,
  type MilestoneProposal,
} from "@adhd/core";
import { z } from "zod";

const PLAN_BLOCK = /```adhd-milestone-plan\s*([\s\S]*?)```/i;
const requiredText = z.string().trim().min(1);
const uniqueStrings = z
  .array(requiredText)
  .transform((items) => [...new Set(items)]);

const taskDraftSchema = z
  .object({
    id: requiredText,
    title: requiredText,
    description: requiredText,
    priority: z.enum(TASK_PRIORITIES),
    tags: uniqueStrings,
  })
  .strict();

const featureSchema = z
  .object({
    id: requiredText,
    title: requiredText,
    description: requiredText,
    acceptanceCriteria: uniqueStrings.refine((items) => items.length > 0, {
      message: "At least one acceptance criterion is required",
    }),
    existingTaskIds: uniqueStrings,
    taskDrafts: z.array(taskDraftSchema),
  })
  .strict()
  .refine(
    (feature) =>
      feature.existingTaskIds.length + feature.taskDrafts.length > 0,
    { message: "A feature must link or draft at least one task" },
  );

const milestonePlanSchema = z
  .object({
    name: requiredText,
    goal: requiredText,
    features: z.array(featureSchema).min(1),
  })
  .strict()
  .superRefine((plan, context) => {
    const featureIds = plan.features.map((feature) => feature.id);
    if (new Set(featureIds).size !== featureIds.length) {
      context.addIssue({
        code: "custom",
        path: ["features"],
        message: "Feature IDs must be unique",
      });
    }
    const taskIds = plan.features.flatMap((feature) =>
      feature.taskDrafts.map((task) => task.id),
    );
    if (new Set(taskIds).size !== taskIds.length) {
      context.addIssue({
        code: "custom",
        path: ["features"],
        message: "Draft task IDs must be unique",
      });
    }
  });

export interface ParsedMilestonePlan {
  proposal?: MilestoneProposal;
  errors: string[];
}

function validationErrors(error: z.ZodError): string[] {
  return error.issues.map(
    (issue) =>
      `${issue.path.length > 0 ? issue.path.join(".") : "plan"}: ${issue.message}`,
  );
}

export function parseMilestonePlan(
  output: string,
  revision: number,
  createdAt: string,
): ParsedMilestonePlan {
  const block = PLAN_BLOCK.exec(output)?.[1];
  if (!block) {
    return { errors: ["Missing fenced adhd-milestone-plan JSON block"] };
  }

  let input: unknown;
  try {
    input = JSON.parse(block);
  } catch {
    return { errors: ["adhd-milestone-plan block is not valid JSON"] };
  }

  const parsed = milestonePlanSchema.safeParse(input);
  if (!parsed.success) {
    return { errors: validationErrors(parsed.error) };
  }

  return {
    proposal: {
      revision,
      ...parsed.data,
      createdAt,
    },
    errors: [],
  };
}
