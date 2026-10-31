import { Hono } from "hono";
import type { ProjectRegistry } from "../services/project-registry.ts";
import type { TeamService } from "../services/team-service.ts";
import { projectScope } from "./project-scope.ts";

export function createTeamRoutes(teams: TeamService, registry: ProjectRegistry): Hono {
  return new Hono().get("/", async (c) => c.json(await teams.view(projectScope(registry, c))));
}
