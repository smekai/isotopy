import {
  DEFAULT_ENGINE_ID,
  ENGINES,
  flattenPipelineStages,
  modelOverrideFor,
  rosterAccepts,
} from "@isotopy/core";
import type { EngineId, PipelineDefinition } from "@isotopy/core";
import { pipelineEngines } from "../../domain/rules/stage-engines.ts";
import type { EngineAssignment } from "../../domain/rules/stage-engines.ts";
import { assertEngineId, getEngineAdapter } from "../../engines/registry.ts";
import type { ProjectPath } from "../../paths.ts";
import type { ModelRosterService } from "../model-roster-service.ts";
import type { SettingsStore } from "../settings-store.ts";

export class RunEngineReadiness {
  constructor(
    private readonly settings: SettingsStore,
    private readonly rosters: ModelRosterService,
  ) {}

  assignment(
    projectId: string,
    engine: string | undefined,
    model: string | undefined,
  ): EngineAssignment {
    const primary = engine ?? DEFAULT_ENGINE_ID;
    getEngineAdapter(primary);
    assertEngineId(primary);
    const preferences = this.settings.getPreferences(projectId);
    const secondary = preferences.secondaryEngine;
    return {
      primary,
      primaryModel: model,
      secondary,
      secondaryModel: secondary === undefined ? undefined : modelOverrideFor(preferences, secondary),
    };
  }

  async requireReady(
    projectPath: ProjectPath,
    pipeline: PipelineDefinition,
    assignment: EngineAssignment,
  ): Promise<void> {
    for (const { engine, model } of pipelineEngines(flattenPipelineStages(pipeline), assignment)) {
      await this.requireEngineReady(projectPath, engine, model);
    }
  }

  private async requireEngineReady(
    projectPath: ProjectPath,
    engineId: EngineId,
    model: string | undefined,
  ): Promise<void> {
    const adapter = getEngineAdapter(engineId);
    const connection = this.settings.getEngineConnection(projectPath.id, engineId);
    const mode = ENGINES[engineId].connections.find((m) => m.id === connection.mode);
    if (mode?.requiresApiKey && !connection.apiKey) {
      throw new Error(
        `Connection mode "${mode.label}" needs an API key — add one in Setup → Connection, or switch back to subscription.`,
      );
    }
    if (!mode?.requiresApiKey && (await adapter.detect?.())?.loggedIn === false) {
      throw new Error(
        `${ENGINES[engineId].label} is not logged in — log in from Setup → AI Harness before starting a run that uses it.`,
      );
    }
    if (model !== undefined) {
      await this.requireOfferedModel(engineId, model);
    }
  }

  private async requireOfferedModel(engineId: EngineId, modelId: string): Promise<void> {
    const roster = await this.rosters.roster(engineId);
    if (!rosterAccepts(roster, modelId)) {
      throw new Error(
        `Model "${modelId}" isn't offered by ${ENGINES[engineId].label} on this machine — ` +
          "pick one in Setup → AI Harness. An unlisted id has to be set in the CLI's own config file first.",
      );
    }
  }
}
