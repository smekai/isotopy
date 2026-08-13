import {
  CLOSEOUT_SHAPE,
  FINDING_SEVERITIES,
  TASK_PRIORITIES,
  refineDeclaredFindings,
  type CloseoutFinding,
  type FollowUpTaskDraft,
  type ProductManagerCloseout,
  type RunState,
} from "@adhd/core";
import { z } from "zod";

const CLOSEOUT_BLOCK = /```adhd-closeout\s*([\s\S]*?)```/i;
const closeoutRecordSchema = z.record(z.string(), z.unknown());

// Everything below normalizes what an agent wrote. Core's shape is the contract
// for what Isotopy persists, so it stays transform-free; padding, duplicates and
// severity prose are cleaned up here, on the way in, and never on the way out.
const requiredText = z.string().trim().min(1);
const uniqueStrings = z
  .array(requiredText)
  .transform((items) => [...new Set(items)]);

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

const agentCloseoutSchema = z
  .object({
    ...CLOSEOUT_SHAPE,
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
  .superRefine(refineDeclaredFindings);

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
    .filter((key) => !Object.hasOwn(CLOSEOUT_SHAPE, key))
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

  const parsed = agentCloseoutSchema.safeParse(input);
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

export interface SourceTaskOutcomeReview {
  contradictions: string[];
  recoveries: string[];
}

export function validateSourceTaskOutcome(
  run: RunState,
  report: ProductManagerCloseout,
): SourceTaskOutcomeReview {
  const sourceIds = new Set(run.sourceTaskIds ?? []);
  const reportedIds = [
    ...report.completedTaskIds,
    ...report.unresolvedTaskIds,
  ];
  const unknown = reportedIds.filter((id) => !sourceIds.has(id));
  const completed = report.completedTaskIds.filter((id) => sourceIds.has(id));
  const unresolved = report.unresolvedTaskIds.filter((id) => sourceIds.has(id));
  const overlap = completed.filter((id) => unresolved.includes(id));
  const declared = new Set([...completed, ...unresolved]);
  const omitted = [...sourceIds].filter((id) => !declared.has(id));
  report.completedTaskIds = completed.filter((id) => !overlap.includes(id));
  report.unresolvedTaskIds = [
    ...new Set([...unresolved, ...overlap, ...omitted]),
  ];
  const contradictions: string[] = [];
  if (overlap.length > 0) {
    contradictions.push(
      `Tasks cannot be both completed and unresolved: ${overlap.join(", ")}`,
    );
  }
  if (unknown.length > 0) {
    contradictions.push(
      `Closeout referenced unknown source tasks: ${unknown.join(", ")}`,
    );
  }
  const recoveries =
    omitted.length > 0
      ? [
          `Unclassified source tasks were preserved as unresolved: ${omitted.join(", ")}`,
        ]
      : [];
  return { contradictions, recoveries };
}
