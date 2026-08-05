// Home leads with the Orchestrator (TASK-114). A spec that wants the fixed
// pipeline composer — the dropdown, "Start run", "Plan as a milestone" — has to
// ask for it first, so the switch lives here rather than in every spec body.
import type { Page } from "@playwright/test";

export async function openPipelineComposer(page: Page): Promise<void> {
  await page.getByTestId("choose-pipeline").click();
}
