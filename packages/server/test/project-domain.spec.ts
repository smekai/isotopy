// Project ids and root comparison are the cross-platform hazard: roots are
// user-supplied absolute paths, and Windows treats them case-insensitively.
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  normalizeProjectRoot,
  projectIdFor,
  projectNameFor,
  sameProjectRoot,
} from "../src/domain/projects.js";

const isWindows = process.platform === "win32";

describe("normalizeProjectRoot", () => {
  test("collapses both separators to one form", () => {
    const mixed = path.join("dev", "my-app");
    expect(normalizeProjectRoot(mixed)).not.toContain("\\");
  });

  test("strips a trailing separator", () => {
    const root = path.resolve("dev", "my-app");
    expect(normalizeProjectRoot(`${root}${path.sep}`)).toBe(normalizeProjectRoot(root));
  });

  test("ignores surrounding whitespace", () => {
    const root = path.resolve("dev", "my-app");
    expect(normalizeProjectRoot(`  ${root}  `)).toBe(normalizeProjectRoot(root));
  });
});

describe("sameProjectRoot", () => {
  test("a path equals itself spelled with the other separator", () => {
    const root = path.resolve("dev", "my-app");
    expect(sameProjectRoot(root, root.replace(/\\/g, "/"))).toBe(true);
  });

  test("case differences fold together only on Windows", () => {
    const root = path.resolve("dev", "My-App");
    expect(sameProjectRoot(root, root.toLowerCase())).toBe(isWindows);
  });

  test("different folders stay different", () => {
    expect(sameProjectRoot(path.resolve("dev", "a"), path.resolve("dev", "b"))).toBe(false);
  });
});

describe("projectIdFor", () => {
  test("is stable for the same folder", () => {
    const root = path.resolve("dev", "my-app");
    expect(projectIdFor(root)).toBe(projectIdFor(root));
  });

  test("carries the folder name so it is readable", () => {
    expect(projectIdFor(path.resolve("dev", "my-app"))).toMatch(/^my-app-[0-9a-f]{8}$/);
  });

  test("two folders sharing a name still get distinct ids", () => {
    const left = projectIdFor(path.resolve("dev", "one", "app"));
    const right = projectIdFor(path.resolve("dev", "two", "app"));
    expect(left).not.toBe(right);
  });

  test("is never the raw path", () => {
    const id = projectIdFor(path.resolve("dev", "my-app"));
    expect(id).not.toContain(path.sep);
    expect(id).not.toContain("/");
  });

  test("a name with spaces or dots is slugged into a safe id", () => {
    expect(projectIdFor(path.resolve("dev", "My App v2.0"))).toMatch(/^my-app-v2-0-[0-9a-f]{8}$/);
  });
});

describe("projectNameFor", () => {
  test("is the folder's own name", () => {
    expect(projectNameFor(path.resolve("dev", "my-app"))).toBe("my-app");
  });
});
