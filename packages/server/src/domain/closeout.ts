import {
  TASK_PRIORITIES,
  type ProductManagerCloseout,
} from "@adhd/core";
import { z } from "zod";

const CLOSEOUT_BLOCK = /```adhd-closeout\s*([\s\S]*?)```/i;
const requiredText = z.string().trim().min(1);
const uniqueStrings = z
  .array(requiredText)
  .transform((items) => [...new Set(items)]);

const FINDING_SEVERITIES = ["blocking", "non_blocking"] as const;

const severityFromAgentProse = z
  .string()
  .transform((value) => value.trim().toLowerCase().replace(/[\s-]+/g, "_"))
  .pipe(z.enum(FINDING_SEVERITIES));

const findingSchema = z
  .object({
    id: requiredText,
    title: requiredText,
    severity: severityFromAgentProse,
    evidence: requiredText.optional(),
  })
  .strict();

const followUpTaskSchema = z
  .object({
    findingId: requiredText,
    title: requiredText,
    description: requiredText,
    priority: z.enum(TASK_PRIORITIES),
    tags: uniqueStrings,
  })
  .strict();

const cleanupCandidateSchema = z
  .object({
    relativePath: requiredText,
    reason: requiredText,
  })
  .strict();

export const productManagerCloseoutSchema = z
  .object({
    summary: requiredText,
    deliveredScope: uniqueStrings,
    decisions: uniqueStrings,
    knowledge: uniqueStrings,
    findings: z.array(findingSchema),
    tasks: z.array(followUpTaskSchema),
    completedTaskIds: uniqueStrings,
    unresolvedTaskIds: uniqueStrings,
    cleanup: z.array(cleanupCandidateSchema),
    nextRecommendation: requiredText.optional(),
  })
  .strict()
  .superRefine((closeout, context) => {
    const findingIds = new Set(closeout.findings.map((finding) => finding.id));
    closeout.tasks.forEach((task, index) => {
      if (!findingIds.has(task.findingId)) {
        context.addIssue({
          code: "custom",
          path: ["tasks", index, "findingId"],
          message: "Follow-up task must reference a declared finding",
        });
      }
    });
  });

export interface ParsedCloseout {
  report: ProductManagerCloseout;
  validationErrors: string[];
}

function emptyCloseout(summary: string): ProductManagerCloseout {
  return {
    summary,
    deliveredScope: [],
    decisions: [],
    knowledge: [],
    findings: [],
    tasks: [],
    completedTaskIds: [],
    unresolvedTaskIds: [],
    cleanup: [],
    nextRecommendation: undefined,
  };
}

function validationErrors(error: z.ZodError): string[] {
  return error.issues.map(
    (issue) =>
      `${issue.path.length > 0 ? issue.path.join(".") : "closeout"}: ${issue.message}`,
  );
}

export function parseProductManagerCloseout(output: string): ParsedCloseout {
  const block = CLOSEOUT_BLOCK.exec(output)?.[1];
  if (!block) {
    return {
      report: emptyCloseout(
        output.trim() || "Product Manager produced no closeout text.",
      ),
      validationErrors: ["Missing fenced adhd-closeout JSON block"],
    };
  }

  let input: unknown;
  try {
    input = JSON.parse(block);
  } catch {
    return {
      report: emptyCloseout(output.trim()),
      validationErrors: ["adhd-closeout block is not valid JSON"],
    };
  }

  const parsed = productManagerCloseoutSchema.safeParse(input);
  if (!parsed.success) {
    return {
      report: emptyCloseout(output.trim()),
      validationErrors: validationErrors(parsed.error),
    };
  }

  return {
    report: {
      ...parsed.data,
      nextRecommendation: parsed.data.nextRecommendation,
    },
    validationErrors: [],
  };
}
