import { Hono } from "hono";
import { joinDirectory, listDirectories } from "../services/directory-browser.js";

/**
 * Read-only directory browsing for the project-location picker.
 *
 * `entry` descends into a child of `path`; the join happens here so the client
 * never has to know whether the platform separator is `\` or `/`.
 */
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
