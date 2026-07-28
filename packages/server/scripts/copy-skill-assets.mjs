import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_ROOT = path.join(PACKAGE_ROOT, "src", "domain", "skills");
const TARGET_ROOT = path.join(PACKAGE_ROOT, "dist", "domain", "skills");
const DIRECTORIES = ["personas", "step-tasks"];

await mkdir(TARGET_ROOT, { recursive: true });
for (const directory of DIRECTORIES) {
  const target = path.join(TARGET_ROOT, directory);
  await rm(target, { recursive: true, force: true });
  await cp(path.join(SOURCE_ROOT, directory), target, { recursive: true });
}
