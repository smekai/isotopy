import { z } from "zod";

export interface StateConfig {
  name: string;
  fileName: string;
}

export interface BoardConfig {
  idPrefix: string;
  nextId: number;
  states: StateConfig[];
  tags?: string[];
  insertPosition?: "top" | "bottom";
}

const text = z.string().trim().min(1);

const stateConfigSchema: z.ZodType<StateConfig> = z
  .object({
    name: text,
    fileName: text,
  })
  .passthrough();

const boardConfigShape = {
  idPrefix: text,
  nextId: z.number().int().nonnegative(),
  states: z.array(stateConfigSchema).min(1),
  tags: z.array(text).optional(),
  insertPosition: z.enum(["top", "bottom"]).optional(),
};

export const boardConfigSchema: z.ZodType<BoardConfig> = z
  .object(boardConfigShape)
  .passthrough();

export const ownedBoardConfigSchema: z.ZodType<BoardConfig> = z
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
