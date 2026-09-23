import { endsTaskSection } from "@smekai/taskplanner";
import { z } from "zod";

export const TASK_SECTION_TEXT_MESSAGE =
  "cannot contain a line that is just `---` or a `## TASK-000:` heading; on the board those end the task and lose everything after them";

export const taskSectionText = z
  .string()
  .trim()
  .min(1)
  .refine((text) => !endsTaskSection(text), TASK_SECTION_TEXT_MESSAGE);

export function refineTaskSectionText(
  plan: { features: { taskDrafts: { description: string }[] }[] },
  context: z.core.$RefinementCtx,
): void {
  plan.features.forEach((feature, featureIndex) =>
    feature.taskDrafts.forEach((draft, draftIndex) => {
      if (endsTaskSection(draft.description)) {
        context.addIssue({
          code: "custom",
          path: ["features", featureIndex, "taskDrafts", draftIndex, "description"],
          message: TASK_SECTION_TEXT_MESSAGE,
        });
      }
    }),
  );
}
