import { Hono } from "hono";
import { joinDirectory, listDirectories } from "../utils/directory-browser.ts";

export const fsRoutes = new Hono().get("/dirs", async (c) => {
  const base = c.req.query("path");
  const entry = c.req.query("entry");
  const target = entry ? joinDirectory(base ?? "", entry) : base;
  try {
    return c.json(await listDirectories(target));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list directory";
    return c.json({ error: message }, 400);
  }
});
