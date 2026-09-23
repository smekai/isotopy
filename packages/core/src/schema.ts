import { z } from "zod";

export const requiredText = z.string().min(1);

export const requiredTexts = z.array(requiredText);

export const timestamp = requiredText;
