import { useState } from "react";
import type { DeploymentAutomation, DeploymentEnvironment } from "@adhd/core";
import { DEPLOYMENT_ENVIRONMENTS, withDeploymentTarget } from "@adhd/core";
import { useAutomation } from "../../hooks/useAutomation";
import type { Dir } from "../../theme";
import {
  ERROR_RED,
  OK_GREEN,
  mutedCaption,
  sectionSubtitle,
  sectionTitle,
} from "./setup-styles";
import {
  BLOCK_ROW,
  BUTTON_ROW,
  actionButton,
  blockTitle,
  statusStyle,
  toggleButton,
} from "./automation-styles";
import { DeployTargetEditor } from "./DeployTargetEditor";
import { ProductStartEditor } from "./ProductStartEditor";
import { ValidationCommandsEditor } from "./ValidationCommandsEditor";

const PRODUCTION_PROMPT =
  "Deploy the configured target to production now? This can change live systems.";

const ENVIRONMENT_LABELS: Record<DeploymentEnvironment, string> = {
  preview: "Preview",
  production: "Production",
};

export interface AutomationSectionProps {
  d: Dir;
  projectId: string;
}

export function AutomationSection({ d, projectId }: AutomationSectionProps) {
  const automation = useAutomation(projectId);
  const [environment, setEnvironment] = useState<DeploymentEnvironment>("preview");
  const { config } = automation;

  if (config === null) {
    return (
      <div>
        <div style={sectionTitle(d)}>Automation</div>
        <div style={statusStyle(automation.error === null ? d.textMuted : ERROR_RED)}>
          {automation.error ?? "Loading project automation…"}
        </div>
      </div>
    );
  }

  const setTarget = (target: DeploymentAutomation | undefined) => {
    automation.edit(withDeploymentTarget(config, environment, target));
  };

  async function confirmProductionDeployment() {
    if (window.confirm(PRODUCTION_PROMPT)) {
      await automation.deployToProduction();
    }
  }

  return (
    <div>
      <div style={sectionTitle(d)}>Automation</div>
      <div style={sectionSubtitle(d)}>
        Commands this project owns. Preview deploys once quality passes; production always
        needs a separate human confirmation.
      </div>

      <ProductStartEditor d={d} config={config} onChange={automation.edit} />

      <ValidationCommandsEditor
        d={d}
        commands={config.validation}
        onChange={(validation) => automation.edit({ ...config, validation })}
      />

      <div style={blockTitle(d)}>Deploy targets</div>
      <div style={mutedCaption(d)}>Where the SRE deploys, per environment.</div>
      <div style={{ ...BLOCK_ROW, marginTop: 12 }}>
        {DEPLOYMENT_ENVIRONMENTS.map((id) => (
          <button
            key={id}
            onClick={() => setEnvironment(id)}
            style={toggleButton(environment === id, d)}
          >
            {ENVIRONMENT_LABELS[id]}
          </button>
        ))}
      </div>
      <DeployTargetEditor
        d={d}
        environment={environment}
        target={config[environment]}
        onChange={setTarget}
      />

      <div style={BUTTON_ROW}>
        <button onClick={() => void automation.save()} style={actionButton(d.accent, d)}>
          Save automation
        </button>
        {environment === "production" && config.production !== undefined && (
          <button
            disabled={automation.deploying}
            onClick={() => void confirmProductionDeployment()}
            style={actionButton(ERROR_RED, d)}
          >
            {automation.deploying ? "Deploying production…" : "Deploy production…"}
          </button>
        )}
      </div>

      {automation.saved && <div style={statusStyle(OK_GREEN)}>Automation saved.</div>}
      {automation.production !== null && (
        <div
          style={statusStyle(automation.production.verdict === "pass" ? OK_GREEN : ERROR_RED)}
        >
          Production deployment {automation.production.verdict === "pass" ? "passed" : "failed"}
          {automation.production.url === undefined ? "" : ` — ${automation.production.url}`}
        </div>
      )}
      {automation.error !== null && (
        <div style={statusStyle(ERROR_RED)}>{automation.error}</div>
      )}
    </div>
  );
}
