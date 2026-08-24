import { z } from "zod";
import { parseJson } from "../domain/validation.ts";

const claudeAuthStatusSchema = z.object({
  loggedIn: z.boolean(),
  email: z.string().trim().min(1).optional(),
  subscriptionType: z.string().trim().min(1).optional(),
});

export interface EngineAuthStatus {
  loggedIn: boolean;
  account?: string;
}

export function claudeAuthStatus(text: string): EngineAuthStatus | undefined {
  const parsed = parseJson(claudeAuthStatusSchema, text);
  if (!parsed.ok) {
    return undefined;
  }
  const { loggedIn, email, subscriptionType } = parsed.value;
  const account = [email, subscriptionType].filter(Boolean).join(" · ");
  return { loggedIn, account: account === "" ? undefined : account };
}
