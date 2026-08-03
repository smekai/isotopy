import { Hono } from "hono";
import {
  createMilestoneSchema,
  createMilestoneFeatureSchema,
  milestoneProposalUpdateSchema,
  reviseMilestonePlanSchema,
  startMilestonePlanningSchema,
  startNextMilestoneRunSchema,
  updateMilestoneFeatureSchema,
  updateMilestoneSchema,
} from "../domain/request-schemas.ts";
import { invalidRequest } from "../domain/validation.ts";
import type { ProjectRegistry } from "../services/project-registry.ts";
import type { RunOrchestrator } from "../services/run-orchestrator.ts";
import { projectScope } from "./project-scope.ts";
import { parseRequestBody } from "./request-body.ts";

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Milestone operation failed";
}

export function createMilestoneRoutes(
  orchestrator: RunOrchestrator,
  registry: ProjectRegistry,
): Hono {
  return new Hono()
    .get("/", (c) =>
      c.json(orchestrator.listMilestones(projectScope(registry, c).id)),
    )
    .post("/plan", async (c) => {
      const parsed = await parseRequestBody(c.req, startMilestonePlanningSchema);
      if (!parsed.ok) {
        return c.json(invalidRequest(parsed.issues), 400);
      }
      const body = parsed.value;
      try {
        return c.json(
          await orchestrator.startMilestonePlanning(
            projectScope(registry, c),
            body.goal,
            {
              engine: body.engine,
              model: body.model,
              permissionMode: body.permissionMode,
            },
          ),
          201,
        );
      } catch (error) {
        return c.json({ error: messageOf(error) }, 400);
      }
    })
    .get("/:id", (c) => {
      const project = projectScope(registry, c);
      const milestone = orchestrator.getMilestone(c.req.param("id"));
      return !milestone || milestone.projectId !== project.id
        ? c.json({ error: "Milestone not found" }, 404)
        : c.json(milestone);
    })
    .post("/", async (c) => {
      const parsed = await parseRequestBody(c.req, createMilestoneSchema);
      if (!parsed.ok) {
        return c.json(invalidRequest(parsed.issues), 400);
      }
      try {
        return c.json(
          await orchestrator.createMilestone(projectScope(registry, c), parsed.value),
          201,
        );
      } catch (error) {
        return c.json({ error: messageOf(error) }, 400);
      }
    })
    .patch("/:id", async (c) => {
      const parsed = await parseRequestBody(c.req, updateMilestoneSchema);
      if (!parsed.ok) {
        return c.json(invalidRequest(parsed.issues), 400);
      }
      try {
        return c.json(
          await orchestrator.updateMilestone(
            projectScope(registry, c),
            c.req.param("id"),
            parsed.value,
          ),
        );
      } catch (error) {
        return c.json({ error: messageOf(error) }, 400);
      }
    })
    .post("/:id/revise", async (c) => {
      const parsed = await parseRequestBody(c.req, reviseMilestonePlanSchema);
      if (!parsed.ok) {
        return c.json(invalidRequest(parsed.issues), 400);
      }
      const body = parsed.value;
      try {
        return c.json(
          await orchestrator.reviseMilestonePlan(
            projectScope(registry, c),
            c.req.param("id"),
            body.feedback,
            {
              engine: body.engine,
              model: body.model,
              permissionMode: body.permissionMode,
            },
          ),
          201,
        );
      } catch (error) {
        return c.json({ error: messageOf(error) }, 400);
      }
    })
    .patch("/:id/proposal", async (c) => {
      const parsed = await parseRequestBody(c.req, milestoneProposalUpdateSchema);
      if (!parsed.ok) {
        return c.json(invalidRequest(parsed.issues), 400);
      }
      try {
        return c.json(
          await orchestrator.updateMilestoneProposal(
            projectScope(registry, c),
            c.req.param("id"),
            parsed.value,
          ),
        );
      } catch (error) {
        return c.json({ error: messageOf(error) }, 400);
      }
    })
    .post("/:id/approve", async (c) => {
      try {
        return c.json(
          await orchestrator.approveMilestonePlan(
            projectScope(registry, c),
            c.req.param("id"),
          ),
        );
      } catch (error) {
        return c.json({ error: messageOf(error) }, 400);
      }
    })
    .post("/:id/features", async (c) => {
      const parsed = await parseRequestBody(c.req, createMilestoneFeatureSchema);
      if (!parsed.ok) {
        return c.json(invalidRequest(parsed.issues), 400);
      }
      try {
        return c.json(
          await orchestrator.addMilestoneFeature(
            projectScope(registry, c),
            c.req.param("id"),
            parsed.value,
          ),
          201,
        );
      } catch (error) {
        return c.json({ error: messageOf(error) }, 400);
      }
    })
    .patch("/:id/features/:featureId", async (c) => {
      const parsed = await parseRequestBody(c.req, updateMilestoneFeatureSchema);
      if (!parsed.ok) {
        return c.json(invalidRequest(parsed.issues), 400);
      }
      try {
        return c.json(
          await orchestrator.updateMilestoneFeature(
            projectScope(registry, c),
            c.req.param("id"),
            c.req.param("featureId"),
            parsed.value,
          ),
        );
      } catch (error) {
        return c.json({ error: messageOf(error) }, 400);
      }
    })
    .post("/:id/features/:featureId/accept", async (c) => {
      try {
        return c.json(
          await orchestrator.acceptMilestoneFeature(
            projectScope(registry, c),
            c.req.param("id"),
            c.req.param("featureId"),
          ),
        );
      } catch (error) {
        return c.json({ error: messageOf(error) }, 400);
      }
    })
    .post("/:id/start-next", async (c) => {
      const parsed = await parseRequestBody(c.req, startNextMilestoneRunSchema);
      if (!parsed.ok) {
        return c.json(invalidRequest(parsed.issues), 400);
      }
      try {
        return c.json(
          await orchestrator.startNextMilestoneRun(
            projectScope(registry, c),
            c.req.param("id"),
            parsed.value,
          ),
          201,
        );
      } catch (error) {
        return c.json({ error: messageOf(error) }, 400);
      }
    })
    .post("/:id/finalize", async (c) => {
      try {
        return c.json(
          await orchestrator.finalizeMilestone(
            projectScope(registry, c),
            c.req.param("id"),
          ),
        );
      } catch (error) {
        return c.json({ error: messageOf(error) }, 400);
      }
    });
}
