import { z } from "zod";

export const requiredText = z.string().min(1);

export const requiredTexts = z.array(requiredText);

export const timestamp = requiredText;

// Mirrors the guard in TaskPlanner's serializer: a `---` line closes the section and a
// `## ID:` line opens the next task, so either one silently truncates what follows.
const SECTION_ENDING_LINE = /^(?:---\s*|## [A-Z]+-\d+:\s*\S.*)$/;

export const taskSectionText = z
  .string()
  .trim()
  .min(1)
  .refine(
    (text) => !text.split(/\r?\n/).some((line) => SECTION_ENDING_LINE.test(line)),
    "cannot contain a line that is just `---` or a `## TASK-000:` heading; on the board those end the task and lose everything after them",
  );
