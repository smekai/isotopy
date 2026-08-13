export const MODEL_PROTOCOL_FENCE = {
  closeout: "isotopy-closeout",
  milestonePlan: "isotopy-milestone-plan",
  orchestratorDecision: "isotopy-orchestrator-decision",
  release: "isotopy-release",
  runArtifacts: "isotopy-run-artifacts",
} as const;

export function extractModelProtocolBlock(
  output: string,
  fence: string,
): string | undefined {
  const escapedFence = fence.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\`\`\`${escapedFence}\\s*([\\s\\S]*?)\`\`\``, "i").exec(
    output,
  )?.[1];
}
