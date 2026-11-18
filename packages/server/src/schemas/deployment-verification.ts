import { requiredText } from "@isotopy/core";
import { z } from "zod";

export const deploymentVerificationSchema = z.union([
  z.object({ verificationRunId: requiredText }).strict(),
  z.object({ verificationRefusal: requiredText }).strict(),
]);

export type DeploymentVerification = z.infer<typeof deploymentVerificationSchema>;
