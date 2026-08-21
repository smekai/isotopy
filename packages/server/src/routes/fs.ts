import { Hono } from "hono";
import { joinDirectory, listDirectories } from "../utils/directory-browser.ts";
import { messageOf } from "../utils/message-of.ts";

export const fsRoutes = new Hono().get("/dirs", async (c) => {
  const base = c.req.query("path");
  const entry = c.req.query("entry");
  const target = entry ? joinDirectory(base ?? "", entry) : base;
  try {
    return c.json(await listDirectories(target));
  } catch (error) {
    return c.json({ error: messageOf(error) }, 400);
  }
});
