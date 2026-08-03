import {
  TASK_PRIORITIES,
  type CloseoutFinding,
  type FollowUpTaskDraft,
  type ProductManagerCloseout,
} from "@adhd/core";
import { z } from "zod";

const CLOSEOUT_BLOCK = /```adhd-closeout\s*([\s\S]*?)```/i;
const closeoutRecordSchema = z.record(z.string(), z.unknown());
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

const closeoutShape = {
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
};

export const productManagerCloseoutSchema = z
  .object(closeoutShape)
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

function issueMessages(error: z.ZodError, field: string): string[] {
  return error.issues.map(
    (issue) => `${[field, ...issue.path].join(".")}: ${issue.message}`,
  );
}

function salvageValue<T>(
  schema: z.ZodType<T>,
  input: unknown,
  field: string,
  fallback: T,
  errors: string[],
): T {
  const parsed = schema.safeParse(input);
  if (parsed.success) {
    return parsed.data;
  }
  errors.push(...issueMessages(parsed.error, field));
  return fallback;
}

function salvageItems<T>(
  schema: z.ZodType<T>,
  input: unknown,
  field: string,
  errors: string[],
): T[] {
  const items = salvageValue(z.array(z.unknown()), input, field, [], errors);
  return items.flatMap((item, index) => {
    const parsed = schema.safeParse(item);
    if (parsed.success) {
      return [parsed.data];
    }
    errors.push(...issueMessages(parsed.error, `${field}.${index}`));
    return [];
  });
}

function salvageStrings(input: unknown, field: string, errors: string[]): string[] {
  return [...new Set(salvageItems(requiredText, input, field, errors))];
}

function unrecognisedKeyErrors(record: Record<string, unknown>): string[] {
  return Object.keys(record)
    .filter((key) => !Object.hasOwn(closeoutShape, key))
    .map((key) => `${key}: Unrecognized key`);
}

function withDeclaredFindings(
  tasks: FollowUpTaskDraft[],
  findings: CloseoutFinding[],
  errors: string[],
): FollowUpTaskDraft[] {
  const declared = new Set(findings.map((finding) => finding.id));
  return tasks.flatMap((task) => {
    if (declared.has(task.findingId)) {
      return [task];
    }
    errors.push(
      `tasks: Follow-up task "${task.title}" references undeclared finding ${task.findingId}`,
    );
    return [];
  });
}

function salvageCloseout(
  record: Record<string, unknown>,
  fallbackSummary: string,
): ParsedCloseout {
  const errors = unrecognisedKeyErrors(record);
  const findings = salvageItems(findingSchema, record.findings, "findings", errors);
  const tasks = withDeclaredFindings(
    salvageItems(followUpTaskSchema, record.tasks, "tasks", errors),
    findings,
    errors,
  );
  return {
    report: {
      summary: salvageValue(
        requiredText,
        record.summary,
        "summary",
        fallbackSummary,
        errors,
      ),
      deliveredScope: salvageStrings(record.deliveredScope, "deliveredScope", errors),
      decisions: salvageStrings(record.decisions, "decisions", errors),
      knowledge: salvageStrings(record.knowledge, "knowledge", errors),
      findings,
      tasks,
      completedTaskIds: salvageStrings(
        record.completedTaskIds,
        "completedTaskIds",
        errors,
      ),
      unresolvedTaskIds: salvageStrings(
        record.unresolvedTaskIds,
        "unresolvedTaskIds",
        errors,
      ),
      cleanup: salvageItems(cleanupCandidateSchema, record.cleanup, "cleanup", errors),
      nextRecommendation: salvageValue(
        requiredText.optional(),
        record.nextRecommendation,
        "nextRecommendation",
        undefined,
        errors,
      ),
    },
    validationErrors: errors,
  };
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
  if (parsed.success) {
    return {
      report: {
        ...parsed.data,
        nextRecommendation: parsed.data.nextRecommendation,
      },
      validationErrors: [],
    };
  }

  const record = closeoutRecordSchema.safeParse(input);
  if (!record.success) {
    return {
      report: emptyCloseout(output.trim()),
      validationErrors: issueMessages(parsed.error, "closeout"),
    };
  }

  return salvageCloseout(record.data, output.trim());
}
