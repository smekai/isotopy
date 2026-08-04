import { z } from "zod";

const text = z.string().trim().min(1);

const stateConfigSchema = z
  .object({
    name: text,
    fileName: text,
  })
  .passthrough();

export type StateConfig = z.infer<typeof stateConfigSchema>;

const boardConfigShape = {
  idPrefix: text,
  nextId: z.number().int().nonnegative(),
  states: z.array(stateConfigSchema).min(1),
  tags: z.array(text).optional(),
  insertPosition: z.enum(["top", "bottom"]).optional(),
};

export const boardConfigSchema = z.object(boardConfigShape).passthrough();

export type BoardConfig = z.infer<typeof boardConfigSchema>;

export const ownedBoardConfigSchema = z
  .object({
    ...boardConfigShape,
    states: z
      .array(
        z
          .object({
            name: text,
            fileName: text,
          })
          .strict(),
      )
      .min(1),
  })
  .strict();
