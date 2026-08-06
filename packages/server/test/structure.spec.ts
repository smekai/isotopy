import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import {
  domainFilesImportingNodeFs,
  misnamedClassFiles,
  sourceFilesOverLineCap,
} from "./support/structure-scan.ts";

const REPO_ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const PACKAGES_SRC = path.join(REPO_ROOT, "packages");

test("domain code never imports node:fs", () => {
  // Arrange
  const domainRoot = path.join(PACKAGES_SRC, "server", "src", "domain");

  // Act
  const offenders = domainFilesImportingNodeFs(domainRoot);

  // Assert
  expect(offenders).toEqual([]);
});

test("no source file under packages/*/src exceeds 1000 lines", () => {
  // Arrange / Act
  const offenders = sourceFilesOverLineCap(PACKAGES_SRC, REPO_ROOT);

  // Assert
  expect(offenders).toEqual([]);
});

test("a file that exports a class is named after one of those classes", () => {
  // Arrange / Act
  const offenders = misnamedClassFiles(PACKAGES_SRC, REPO_ROOT);

  // Assert
  expect(offenders).toEqual([]);
});
