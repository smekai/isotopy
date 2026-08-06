import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const MAX_LINES = 1000;

export function listSourceFiles(root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      out.push(...listSourceFiles(full));
      continue;
    }
    if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

export function packageSrcRoots(packagesRoot: string): string[] {
  return readdirSync(packagesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(packagesRoot, entry.name, "src"))
    .filter((src) => {
      try {
        return statSync(src).isDirectory();
      } catch {
        return false;
      }
    });
}

function kebabToPascal(fileBase: string): string {
  return fileBase
    .split("-")
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join("");
}

function exportedClassNames(source: string): string[] {
  return [...source.matchAll(/export\s+(?:abstract\s+)?class\s+([A-Za-z0-9_]+)/g)].map(
    (match) => match[1]!,
  );
}

const FS_MODULE = String.raw`(?:node:)?fs(?:\/promises)?`;

export function domainFilesImportingNodeFs(domainRoot: string): string[] {
  return listSourceFiles(domainRoot).filter((file) => {
    const source = readFileSync(file, "utf8");
    return (
      new RegExp(String.raw`from\s+["']${FS_MODULE}["']`).test(source) ||
      new RegExp(String.raw`import\s+["']${FS_MODULE}["']`).test(source) ||
      new RegExp(String.raw`require\(["']${FS_MODULE}["']\)`).test(source)
    );
  });
}

export function sourceFilesOverLineCap(
  packagesRoot: string,
  repoRoot: string,
): Array<{ file: string; lines: number }> {
  return packageSrcRoots(packagesRoot)
    .flatMap(listSourceFiles)
    .map((file) => ({
      file: path.relative(repoRoot, file).replaceAll("\\", "/"),
      lines: readFileSync(file, "utf8").split(/\r?\n/).length,
    }))
    .filter((entry) => entry.lines > MAX_LINES);
}

export function misnamedClassFiles(
  packagesRoot: string,
  repoRoot: string,
): Array<{ file: string; expected: string; classes: string[] }> {
  return packageSrcRoots(packagesRoot).flatMap(listSourceFiles).flatMap((file) => {
    const classes = exportedClassNames(readFileSync(file, "utf8"));
    if (classes.length === 0) {
      return [];
    }
    const expected = kebabToPascal(path.basename(file).replace(/\.(ts|tsx)$/, ""));
    return classes.includes(expected)
      ? []
      : [
          {
            file: path.relative(repoRoot, file).replaceAll("\\", "/"),
            expected,
            classes,
          },
        ];
  });
}
