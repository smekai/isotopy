import { Hono } from "hono";
import type {
  CreateMilestoneFeatureInput,
  CreateMilestoneInput,
  MilestoneProposal,
  ReviseMilestonePlanInput,
  StartMilestonePlanningInput,
  UpdateMilestoneFeatureInput,
  UpdateMilestoneInput,
} from "@adhd/core";
import type { ProjectRegistry } from "../services/project-registry.ts";
import type { RunOrchestrator } from "../services/run-orchestrator.ts";
import { projectScope } from "./project-scope.ts";
import { runOptionsFrom } from "./run-options.ts";

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
      const body = await c.req
        .json<StartMilestonePlanningInput>()
        .catch((): StartMilestonePlanningInput => ({ goal: "" }));
      try {
        return c.json(
          await orchestrator.startMilestonePlanning(
            projectScope(registry, c),
            body.goal,
            runOptionsFrom(body),
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
      const body = await c.req
        .json<CreateMilestoneInput>()
        .catch(() => ({ name: "" }));
      try {
        return c.json(
          await orchestrator.createMilestone(projectScope(registry, c), body),
          201,
        );
      } catch (error) {
        return c.json({ error: messageOf(error) }, 400);
      }
    })
    .patch("/:id", async (c) => {
      const body = await c.req.json<UpdateMilestoneInput>().catch(() => ({}));
      try {
        return c.json(
          await orchestrator.updateMilestone(
            projectScope(registry, c),
            c.req.param("id"),
            body,
          ),
        );
      } catch (error) {
        return c.json({ error: messageOf(error) }, 400);
      }
    })
    .post("/:id/revise", async (c) => {
      const body = await c.req
        .json<ReviseMilestonePlanInput>()
        .catch((): ReviseMilestonePlanInput => ({ feedback: "" }));
      try {
        return c.json(
          await orchestrator.reviseMilestonePlan(
            projectScope(registry, c),
            c.req.param("id"),
            body.feedback,
            runOptionsFrom(body),
          ),
          201,
        );
      } catch (error) {
        return c.json({ error: messageOf(error) }, 400);
      }
    })
    .patch("/:id/proposal", async (c) => {
      const body = await c.req
        .json<Omit<MilestoneProposal, "revision" | "createdAt">>()
        .catch(() => ({ name: "", goal: "", features: [] }));
      try {
        return c.json(
          await orchestrator.updateMilestoneProposal(
            projectScope(registry, c),
            c.req.param("id"),
            body,
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
      const body = await c.req
        .json<CreateMilestoneFeatureInput>()
        .catch(() => ({ title: "" }));
      try {
        return c.json(
          await orchestrator.addMilestoneFeature(
            projectScope(registry, c),
            c.req.param("id"),
            body,
          ),
          201,
        );
      } catch (error) {
        return c.json({ error: messageOf(error) }, 400);
      }
    })
    .patch("/:id/features/:featureId", async (c) => {
      const body = await c.req
        .json<UpdateMilestoneFeatureInput>()
        .catch(() => ({}));
      try {
        return c.json(
          await orchestrator.updateMilestoneFeature(
            projectScope(registry, c),
            c.req.param("id"),
            c.req.param("featureId"),
            body,
          ),
        );
      } catch (error) {
        return c.json({ error: messageOf(error) }, 400);
      }
    })
    .post("/:id/start-next", async (c) => {
      const body = await c.req
        .json<{ engine?: string; model?: string; permissionMode?: string }>()
        .catch(() => ({}));
      try {
        return c.json(
          await orchestrator.startNextMilestoneRun(
            projectScope(registry, c),
            c.req.param("id"),
            body,
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
