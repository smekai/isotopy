// Unit spec: a project collection is fed by a snapshot plus a live stream, so an
// update can arrive for an item the snapshot already holds (replace, keep
// position) or for one it has never seen (prepend — the server sorts newest first).
import { expect, test } from "vitest";
import { mergeById } from "../src/merge-by-id";

interface Item {
  id: string;
  status: string;
}

test("replaces an item in place, keeping its position", () => {
  const merged = mergeById<Item>(
    [{ id: "a", status: "running" }, { id: "b", status: "completed" }],
    { id: "a", status: "completed" },
  );
  expect(merged).toEqual([{ id: "a", status: "completed" }, { id: "b", status: "completed" }]);
});

test("prepends an item it has not seen", () => {
  const merged = mergeById<Item>([{ id: "a", status: "completed" }], { id: "new", status: "running" });
  expect(merged.map((item) => item.id)).toEqual(["new", "a"]);
});

test("does not mutate the list it was given", () => {
  const items: Item[] = [{ id: "a", status: "running" }];
  mergeById(items, { id: "a", status: "failed" });
  expect(items[0]?.status).toBe("running");
});
