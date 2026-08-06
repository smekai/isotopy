import { z } from "zod";

const requiredText = z.string().trim().min(1);

const milestoneSummarySchema = z
  .object({
    milestoneId: requiredText,
    name: requiredText,
    goal: requiredText.optional(),
    completedAt: requiredText.optional(),
    decisions: z.array(requiredText),
    knowledge: z.array(requiredText),
    openProblems: z.array(
      z
        .object({
          id: requiredText,
          title: requiredText,
          severity: z.enum(["blocking", "non_blocking"]),
          evidence: requiredText.optional(),
          sourceRunId: requiredText,
        })
        .strict(),
    ),
    cleanup: z
      .object({
        removed: z.array(requiredText),
        rejected: z.array(requiredText),
      })
      .strict(),
  })
  .strict();

export interface MilestoneSummaryContext {
  name: string;
  decisions: string[];
  knowledge: string[];
  problems: string[];
}

export function parseMilestoneSummary(
  content: string,
): MilestoneSummaryContext | undefined {
  try {
    const parsed = milestoneSummarySchema.safeParse(JSON.parse(content));
    return parsed.success
      ? {
          name: parsed.data.name,
          decisions: parsed.data.decisions,
          knowledge: parsed.data.knowledge,
          problems: parsed.data.openProblems.map((problem) => problem.title),
        }
      : undefined;
  } catch {
    return undefined;
  }
}
